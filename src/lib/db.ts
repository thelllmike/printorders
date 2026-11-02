import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { Order, OrderFile, Status } from "./types";

export const DATA_DIR = path.resolve(
  (process.env.DATA_DIR || "data").replace(/^~(?=\/)/, os.homedir()),
);
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

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
  `);
  return db;
}

type OrderRow = {
  id: number;
  quantity: number;
  note: string;
  status: Status;
  created_at: string;
  updated_at: string;
};
type FileRow = OrderFile & { order_id: number; stored_name: string };

export function listOrders(): Order[] {
  const database = getDb();
  const orders = database
    .prepare("SELECT * FROM orders ORDER BY id DESC")
    .all() as OrderRow[];
  const files = database
    .prepare("SELECT * FROM files ORDER BY rowid")
    .all() as FileRow[];

  const byOrder = new Map<number, OrderFile[]>();
  for (const { id, order_id, name, mime, size } of files) {
    const list = byOrder.get(order_id) ?? [];
    list.push({ id, name, mime, size });
    byOrder.set(order_id, list);
  }

  return orders.map((o) => ({
    id: o.id,
    quantity: o.quantity,
    note: o.note,
    status: o.status,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    files: byOrder.get(o.id) ?? [],
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

export function setOrderStatus(id: number, status: Status) {
  const { changes } = getDb()
    .prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?")
    .run(status, new Date().toISOString(), id);
  return changes > 0;
}

export function getFile(id: string) {
  return getDb().prepare("SELECT * FROM files WHERE id = ?").get(id) as
    | FileRow
    | undefined;
}
