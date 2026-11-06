"use client";

import { type DragEvent, type FormEvent, useRef, useState } from "react";
import {
  MAX_FILES,
  MAX_FILE_MB,
  MAX_NOTE_LENGTH,
  MAX_QUANTITY,
  MAX_TOTAL_MB,
  STATUSES,
  STATUS_LABELS,
  type Order,
  type Status,
} from "@/lib/types";
import {
  CopiesProgress,
  Header,
  OfflineBanner,
  OrderCard,
  OrderTotals,
  PresenceStatus,
  UnreadBanner,
  formatSize,
} from "./shared";
import { useOrders } from "./useOrders";

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";

function Tracker({ status }: { status: Status }) {
  const current = STATUSES.indexOf(status);
  return (
    <ol className="tracker" aria-label={`Status: ${STATUS_LABELS[status]}`}>
      {STATUSES.map((step, i) => (
        <li
          key={step}
          className={i < current ? "done" : i === current ? `current ${step}` : ""}
          aria-current={i === current ? "step" : undefined}
        >
          <span className="dot" />
          {STATUS_LABELS[step]}
        </li>
      ))}
    </ol>
  );
}

function upload(
  body: FormData,
  onProgress: (percent: number) => void,
  method = "POST",
  url = "/api/orders",
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      if (xhr.status === 401) window.location.href = "/login";
      reject(new Error(xhr.response?.error ?? "Upload failed. Please try again."));
    };
    xhr.onerror = () => reject(new Error("Could not connect. Please try again."));
    xhr.send(body);
  });
}

// datetime-local inputs take local time without a time zone.
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function EditOrder({
  order,
  onDone,
  onCancel,
}: {
  order: Order;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [quantity, setQuantity] = useState(String(order.quantity));
  const [note, setNote] = useState(order.note);
  const [deadline, setDeadline] = useState(toLocalInput(order.deadline));
  const [removed, setRemoved] = useState<string[]>([]);
  const [added, setAdded] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const busy = progress !== null;
  const prefix = `edit-${order.id}`;

  function toggleRemoved(id: string) {
    setRemoved((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (order.files.length - removed.length + added.length === 0) {
      return setError("An order needs at least one file");
    }
    const tooBig = added.find((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    if (tooBig) return setError(`${tooBig.name} is larger than ${MAX_FILE_MB} MB`);

    const body = new FormData();
    body.append("quantity", quantity);
    body.append("note", note);
    if (deadline) body.append("deadline", new Date(deadline).toISOString());
    removed.forEach((id) => body.append("removeFiles", id));
    added.forEach((file) => body.append("files", file));

    setError("");
    setProgress(0);
    try {
      await upload(body, setProgress, "PUT", `/api/orders/${order.id}`);
      await onDone();
    } catch (e) {
      setError((e as Error).message);
      setProgress(null);
    }
  }

  return (
    <form className="form edit-order" onSubmit={save}>
      <h4 className="section-title">Edit order #{order.id}</h4>
      <ul className="chosen">
        {order.files.map((file) => {
          const isRemoved = removed.includes(file.id);
          return (
            <li key={file.id} className={isRemoved ? "removed" : undefined}>
              <span className="chosen-name">{file.name}</span>
              <span className="muted">{formatSize(file.size)}</span>
              <button
                type="button"
                className="link"
                disabled={busy}
                aria-label={`${isRemoved ? "Keep" : "Remove"} ${file.name}`}
                onClick={() => toggleRemoved(file.id)}
              >
                {isRemoved ? "Undo" : "Remove"}
              </button>
            </li>
          );
        })}
        {added.map((file, i) => (
          <li key={`${file.name}-${i}`}>
            <span className="chosen-name">{file.name}</span>
            <span className="muted">New · {formatSize(file.size)}</span>
            <button
              type="button"
              className="link"
              disabled={busy}
              aria-label={`Remove ${file.name}`}
              onClick={() => setAdded(added.filter((_, n) => n !== i))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <label className="tool add-files">
        Add files
        <input
          type="file"
          multiple
          accept={ACCEPT}
          disabled={busy}
          onChange={(e) => {
            const list = e.target.files;
            if (list) setAdded((current) => [...current, ...Array.from(list)]);
            e.target.value = "";
          }}
        />
      </label>

      <label htmlFor={`${prefix}-quantity`}>Quantity (copies)</label>
      <input
        id={`${prefix}-quantity`}
        type="number"
        inputMode="numeric"
        min={1}
        max={MAX_QUANTITY}
        required
        disabled={busy}
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
      />

      <label htmlFor={`${prefix}-deadline`}>Deadline (optional)</label>
      <input
        id={`${prefix}-deadline`}
        type="datetime-local"
        disabled={busy}
        value={deadline}
        onChange={(e) => setDeadline(e.target.value)}
      />

      <label htmlFor={`${prefix}-note`}>Note</label>
      <textarea
        id={`${prefix}-note`}
        rows={3}
        maxLength={MAX_NOTE_LENGTH}
        disabled={busy}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />

      {error && <p className="error" role="alert">{error}</p>}
      <div className="tool-row">
        <button type="button" className="tool" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button className="tool save" disabled={busy}>
          {busy ? `Saving… ${progress}%` : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function OrderActions({ order, refresh }: { order: Order; refresh: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  if (editing) {
    return (
      <EditOrder
        order={order}
        onCancel={() => setEditing(false)}
        onDone={async () => {
          await refresh();
          setEditing(false);
        }}
      />
    );
  }

  async function remove() {
    if (!window.confirm(`Delete order #${order.id}? Its files will be removed too.`)) return;
    setError("");
    setDeleting(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, { method: "DELETE" });
      if (res.status === 401) window.location.href = "/login";
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Could not delete the order. Please try again.");
      }
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      setDeleting(false);
    }
  }

  return (
    <div className="order-actions">
      <div className="tool-row">
        <button className="tool" disabled={deleting} onClick={() => setEditing(true)}>
          Edit
        </button>
        {order.status === "pending" && (
          <button className="tool danger" disabled={deleting} onClick={remove}>
            {deleting ? "Deleting…" : "Delete"}
          </button>
        )}
      </div>
      {order.status === "ready" && (
        <p className="muted locked-note">Editing this order moves it back to Ongoing.</p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

export default function CustomerView() {
  const { orders, offline, presence, refresh } = useOrders();
  const [files, setFiles] = useState<File[]>([]);
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [deadline, setDeadline] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<"active" | "history">("active");
  const busy = progress !== null;
  // Ready orders leave the main list for History, where they can still be edited.
  const active = orders?.filter((o) => o.status !== "ready") ?? [];
  const history = orders?.filter((o) => o.status === "ready") ?? [];
  const shown = view === "history" ? history : active;

  function addFiles(list: FileList | null) {
    if (!list) return;
    setError("");
    const added = Array.from(list);
    setFiles((current) => [...current, ...added]);
    if (input.current) input.current.value = "";
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    if (!busy) addFiles(event.dataTransfer.files);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (files.length === 0) return setError("Add at least one file");

    const tooBig = files.find((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    if (tooBig) return setError(`${tooBig.name} is larger than ${MAX_FILE_MB} MB`);

    // Checked here too so a mistake doesn't surface only after a long upload.
    const due = deadline ? new Date(deadline) : null;
    if (due && due.getTime() <= Date.now()) return setError("Deadline must be in the future");

    const body = new FormData();
    files.forEach((file) => body.append("files", file));
    body.append("quantity", quantity);
    body.append("note", note);
    // Sent as UTC because the server may be in a different time zone from the customer.
    if (due) body.append("deadline", due.toISOString());

    setError("");
    setProgress(0);
    try {
      await upload(body, setProgress);
      setFiles([]);
      setNote("");
      setDeadline("");
      setQuantity("1");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
    setProgress(null);
  }

  return (
    <main className="page">
      <Header
        title="Print Orders"
        status={<PresenceStatus presence={presence} role="customer" />}
      />
      <OfflineBanner show={offline} />
      <UnreadBanner orders={orders} />
      <OrderTotals orders={orders} />
      <div className="columns">
        <section aria-labelledby="new-order">
          <h2 id="new-order">New order</h2>
          <form className="card form" onSubmit={submit}>
            <label
              className={`dropzone${dragging ? " dragging" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={drop}
            >
              <input
                ref={input}
                type="file"
                multiple
                accept={ACCEPT}
                disabled={busy}
                onChange={(e) => addFiles(e.target.files)}
              />
              <strong>Choose files or drop them here</strong>
              <span>
                PDF, JPG, PNG or WebP. Up to {MAX_FILES} files, {MAX_FILE_MB} MB each,{" "}
                {MAX_TOTAL_MB} MB in total.
              </span>
            </label>

            {files.length > 0 && (
              <ul className="chosen">
                {files.map((file, i) => (
                  <li key={`${file.name}-${i}`}>
                    <span className="chosen-name">{file.name}</span>
                    <span className="muted">{formatSize(file.size)}</span>
                    <button
                      type="button"
                      className="link"
                      disabled={busy}
                      aria-label={`Remove ${file.name}`}
                      onClick={() => setFiles(files.filter((_, n) => n !== i))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <label htmlFor="quantity">Quantity (copies)</label>
            <input
              id="quantity"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_QUANTITY}
              required
              disabled={busy}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />

            <label htmlFor="deadline">Deadline (optional)</label>
            <input
              id="deadline"
              type="datetime-local"
              disabled={busy}
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />

            <label htmlFor="note">Note</label>
            <textarea
              id="note"
              rows={4}
              maxLength={MAX_NOTE_LENGTH}
              placeholder="For example: A4, colour, double-sided"
              disabled={busy}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />

            {error && <p className="error" role="alert">{error}</p>}

            <button className="primary" disabled={busy}>
              {busy ? `Uploading… ${progress}%` : "Send to print"}
            </button>
            {busy && (
              <div className="progress" aria-hidden="true">
                <div style={{ width: `${progress}%` }} />
              </div>
            )}
          </form>
        </section>

        <section aria-label="Your orders">
          <div className="tabs" role="group" aria-label="Show orders">
            <button
              className={view === "active" ? "tab active" : "tab"}
              aria-pressed={view === "active"}
              onClick={() => setView("active")}
            >
              Your orders
              <span>{active.length}</span>
            </button>
            <button
              className={view === "history" ? "tab active" : "tab"}
              aria-pressed={view === "history"}
              onClick={() => setView("history")}
            >
              History
              <span>{history.length}</span>
            </button>
          </div>
          {orders === null && <p className="empty">Loading…</p>}
          {orders && shown.length === 0 && (
            <p className="empty">
              {view === "history"
                ? "Orders the shop marks Ready will show here."
                : "Orders you send will show here."}
            </p>
          )}
          <div className="orders">
            {shown.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                role="customer"
                presence={presence}
                onChatClosed={refresh}
              >
                <div className="order-summary">
                  <CopiesProgress printed={order.printedCopies} total={order.quantity} />
                  <span className={order.paid ? "badge paid" : "badge unpaid"}>
                    {order.paid ? "Paid" : "Not paid"}
                  </span>
                </div>
                <Tracker status={order.status} />
                <OrderActions order={order} refresh={refresh} />
              </OrderCard>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
