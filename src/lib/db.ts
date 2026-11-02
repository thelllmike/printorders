import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { Role } from "./auth";
import type { Message, Order, OrderChanges, OrderFile, Presence, Status } from "./types";

export const DATA_DIR = path.resolve(
  (process.env.DATA_DIR || "data").replace(/^~(?=\/)/, os.homedir()),
);
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

// The newest message each side has read, for counting unread messages.
const READ_COLUMN = {
  customer: "customer_read_message",
  shop: "shop_read_message",
} as const;

// Open pages check in every 5 seconds. Allow for a slow or missed check-in.
const ONLINE_MS = 20_000;

let db: Database.Database | undefined;

function getDb() {
  if (db) return db;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  db = new Database(path.join(DATA_DIR, "app.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quantity INTEGER NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'ongoing', 'ready')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS files_order_id ON files(order_id);
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      sender TEXT NOT NULL CHECK (sender IN ('customer', 'shop')),
      text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS messages_order_id ON messages(order_id, id);
    CREATE TABLE IF NOT EXISTS presence (
      role TEXT PRIMARY KEY,
      last_seen TEXT NOT NULL
    );
  `);
  migrate(db);
  return db;
}

// CREATE TABLE IF NOT EXISTS leaves existing tables alone, so columns added
// after the first release have to be added to live databases here.
function migrate(database: Database.Database) {
  const columns = (table: string) =>
    (database.pragma(`table_info(${table})`) as { name: string }[]).map((c) => c.name);

  database.transaction(() => {
    const orderColumns = columns("orders");
    if (!orderColumns.includes("paid")) {
      database.exec("ALTER TABLE orders ADD COLUMN paid INTEGER NOT NULL DEFAULT 0");
    }
    if (!orderColumns.includes("printed_copies")) {
      database.exec(`
        ALTER TABLE orders ADD COLUMN printed_copies INTEGER NOT NULL DEFAULT 0;
        UPDATE orders SET printed_copies = quantity WHERE status = 'ready';
      `);
    }
    for (const column of Object.values(READ_COLUMN)) {
      if (!orderColumns.includes(column)) {
        database.exec(`ALTER TABLE orders ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0`);
      }
    }
    if (!columns("files").includes("kind")) {
      database.exec("ALTER TABLE files ADD COLUMN kind TEXT NOT NULL DEFAULT 'order'");
    }
  })();
}

type OrderRow = {
  id: number;
  quantity: number;
  note: string;
  status: Status;
  paid: number;
  printed_copies: number;
  created_at: string;
  updated_at: string;
};
type FileRow = OrderFile & {
  order_id: number;
  stored_name: string;
  kind: "order" | "finished";
};

export function listOrders(role: Role): Order[] {
  const database = getDb();
  const orders = database
    .prepare("SELECT * FROM orders ORDER BY id DESC")
    .all() as OrderRow[];
  const files = database
    .prepare("SELECT * FROM files ORDER BY rowid")
    .all() as FileRow[];

  const unread = database
    .prepare(
      `SELECT m.order_id, COUNT(*) AS count
       FROM messages m JOIN orders o ON o.id = m.order_id
       WHERE m.sender != ? AND m.id > o.${READ_COLUMN[role]}
       GROUP BY m.order_id`,
    )
    .all(role) as { order_id: number; count: number }[];
  const unreadByOrder = new Map(unread.map((u) => [u.order_id, u.count]));

  const byOrder = new Map<number, OrderFile[]>();
  const photosByOrder = new Map<number, OrderFile[]>();
  for (const { id, order_id, name, mime, size, kind } of files) {
    const groups = kind === "finished" ? photosByOrder : byOrder;
    const list = groups.get(order_id) ?? [];
    list.push({ id, name, mime, size });
    groups.set(order_id, list);
  }

  return orders.map((o) => ({
    id: o.id,
    quantity: o.quantity,
    note: o.note,
    status: o.status,
    paid: o.paid === 1,
    printedCopies: o.printed_copies,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    files: byOrder.get(o.id) ?? [],
    photos: photosByOrder.get(o.id) ?? [],
    unreadMessages: unreadByOrder.get(o.id) ?? 0,
  }));
}

export function createOrder(
  quantity: number,
  note: string,
  files: (OrderFile & { storedName: string })[],
) {
  const database = getDb();
  const now = new Date().toISOString();
  database.transaction(() => {
    const { lastInsertRowid } = database
      .prepare(
        "INSERT INTO orders (quantity, note, created_at, updated_at) VALUES (?, ?, ?, ?)",
      )
      .run(quantity, note, now, now);
    const insertFile = database.prepare(
      "INSERT INTO files (id, order_id, name, stored_name, mime, size) VALUES (?, ?, ?, ?, ?, ?)",
    );
    for (const f of files) {
      insertFile.run(f.id, lastInsertRowid, f.name, f.storedName, f.mime, f.size);
    }
  })();
}

export function getOrderCounts(id: number) {
  return getDb()
    .prepare(
      `SELECT o.quantity, o.status, COUNT(f.id) AS photos
       FROM orders o LEFT JOIN files f ON f.order_id = o.id AND f.kind = 'finished'
       WHERE o.id = ? GROUP BY o.id`,
    )
    .get(id) as { quantity: number; status: Status; photos: number } | undefined;
}

export function updateOrder(id: number, { status, paid, printedCopies }: OrderChanges) {
  const { changes } = getDb()
    .prepare(
      `UPDATE orders SET
         status = COALESCE(?, status),
         paid = COALESCE(?, paid),
         printed_copies = COALESCE(?, printed_copies),
         updated_at = ?
       WHERE id = ?`,
    )
    .run(
      status ?? null,
      paid === undefined ? null : Number(paid),
      printedCopies ?? null,
      new Date().toISOString(),
      id,
    );
  return changes > 0;
}

export function addPhotos(orderId: number, photos: (OrderFile & { storedName: string })[]) {
  const database = getDb();
  const insert = database.prepare(
    "INSERT INTO files (id, order_id, name, stored_name, mime, size, kind) VALUES (?, ?, ?, ?, ?, ?, 'finished')",
  );
  database.transaction(() => {
    for (const p of photos) {
      insert.run(p.id, orderId, p.name, p.storedName, p.mime, p.size);
    }
  })();
}

export function getFile(id: string) {
  return getDb().prepare("SELECT * FROM files WHERE id = ?").get(id) as
    | FileRow
    | undefined;
}

export function deleteFile(id: string) {
  getDb().prepare("DELETE FROM files WHERE id = ?").run(id);
}

export function listMessages(orderId: number): Message[] {
  const rows = getDb()
    .prepare("SELECT * FROM messages WHERE order_id = ? ORDER BY id")
    .all(orderId) as (Omit<Message, "createdAt"> & { created_at: string })[];
  return rows.map(({ id, sender, text, created_at }) => ({
    id,
    sender,
    text,
    createdAt: created_at,
  }));
}

export function addMessage(orderId: number, sender: Role, text: string) {
  getDb()
    .prepare("INSERT INTO messages (order_id, sender, text, created_at) VALUES (?, ?, ?, ?)")
    .run(orderId, sender, text, new Date().toISOString());
}

export function markMessagesRead(orderId: number, role: Role, messageId: number) {
  const column = READ_COLUMN[role];
  getDb()
    .prepare(`UPDATE orders SET ${column} = MAX(${column}, ?) WHERE id = ?`)
    .run(messageId, orderId);
}

export function recordPresence(role: Role) {
  getDb()
    .prepare(
      `INSERT INTO presence (role, last_seen) VALUES (?, ?)
       ON CONFLICT (role) DO UPDATE SET last_seen = excluded.last_seen`,
    )
    .run(role, new Date().toISOString());
}

export function getPresence(role: Role): Presence {
  const row = getDb().prepare("SELECT last_seen FROM presence WHERE role = ?").get(role) as
    | { last_seen: string }
    | undefined;
  const lastSeen = row?.last_seen ?? null;
  return {
    online: lastSeen !== null && Date.now() - Date.parse(lastSeen) < ONLINE_MS,
    lastSeen,
  };
}
