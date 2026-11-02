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
  type Status,
} from "@/lib/types";
import {
  CopiesProgress,
  Header,
  OfflineBanner,
  OrderCard,
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

function upload(body: FormData, onProgress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/orders");
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

export default function CustomerView() {
  const { orders, offline, presence, refresh } = useOrders();
  const [files, setFiles] = useState<File[]>([]);
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const busy = progress !== null;

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

    const body = new FormData();
    files.forEach((file) => body.append("files", file));
    body.append("quantity", quantity);
    body.append("note", note);

    setError("");
    setProgress(0);
    try {
      await upload(body, setProgress);
      setFiles([]);
      setNote("");
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

        <section aria-labelledby="your-orders">
          <h2 id="your-orders">Your orders</h2>
          {orders === null && <p className="empty">Loading…</p>}
          {orders?.length === 0 && (
            <p className="empty">Orders you send will show here.</p>
          )}
          <div className="orders">
            {orders?.map((order) => (
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
              </OrderCard>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
