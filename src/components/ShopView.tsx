"use client";

import { type ChangeEvent, useState } from "react";
import {
  MAX_PHOTOS,
  MAX_PHOTO_MB,
  type Order,
  type OrderChanges,
  type OrderFile,
  type Presence,
  STATUSES,
  STATUS_LABELS,
  type Status,
} from "@/lib/types";
import { Header, OfflineBanner, OrderCard, PresenceStatus, UnreadBanner } from "./shared";
import { useOrders } from "./useOrders";

type Filter = Status | "all";

const PHOTO_ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";

function CopiesEditor({
  order,
  onSave,
}: {
  order: Order;
  onSave: (printedCopies: number) => void;
}) {
  // Held apart from the order so the 5-second refresh can't overwrite a number being typed.
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? String(order.printedCopies);
  const number = Number(value);
  const valid = Number.isInteger(number) && number >= 0 && number <= order.quantity;
  const inputId = `printed-${order.id}`;

  function step(by: number) {
    const base = valid ? number : order.printedCopies;
    setDraft(String(Math.min(order.quantity, Math.max(0, base + by))));
  }

  return (
    <div className="copies-editor">
      <label htmlFor={inputId}>Copies printed</label>
      <button
        className="step"
        aria-label="One copy fewer"
        disabled={number <= 0}
        onClick={() => step(-1)}
      >
        −
      </button>
      <input
        id={inputId}
        type="number"
        inputMode="numeric"
        min={0}
        max={order.quantity}
        value={value}
        onChange={(e) => setDraft(e.target.value)}
      />
      <button
        className="step"
        aria-label="One copy more"
        disabled={number >= order.quantity}
        onClick={() => step(1)}
      >
        +
      </button>
      <span>of {order.quantity}</span>
      {draft !== null && number !== order.printedCopies && (
        <button
          className="tool save"
          disabled={!valid || value.trim() === ""}
          onClick={() => {
            onSave(number);
            setDraft(null);
          }}
        >
          Save
        </button>
      )}
    </div>
  );
}

function ShopOrder({
  order,
  presence,
  onChange,
  onAddPhotos,
  onRemovePhoto,
  onChatClosed,
}: {
  order: Order;
  presence: Presence | null;
  onChange: (changes: OrderChanges) => void;
  onAddPhotos: (files: File[]) => Promise<void>;
  onRemovePhoto: (photo: OrderFile) => void;
  onChatClosed: () => void;
}) {
  const [uploading, setUploading] = useState(false);

  async function choosePhotos(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    await onAddPhotos(files);
    setUploading(false);
  }

  return (
    <OrderCard
      order={order}
      role="shop"
      presence={presence}
      onChatClosed={onChatClosed}
      onRemovePhoto={onRemovePhoto}
    >
      <div className="shop-tools">
        {order.status === "pending" ? (
          <p className="copies-locked">
            <strong>Copies printed: {order.printedCopies} of {order.quantity}</strong>
            <span>Set to Ongoing to update this.</span>
          </p>
        ) : (
          <CopiesEditor order={order} onSave={(printedCopies) => onChange({ printedCopies })} />
        )}
        <div className="tool-row">
          <button
            className={order.paid ? "tool paid" : "tool"}
            aria-pressed={order.paid}
            onClick={() => onChange({ paid: !order.paid })}
          >
            {order.paid ? "Paid ✓" : "Mark as paid"}
          </button>
          <label className="tool">
            {uploading ? "Uploading…" : "Add finished photo"}
            <input
              type="file"
              multiple
              accept={PHOTO_ACCEPT}
              disabled={uploading || order.photos.length >= MAX_PHOTOS}
              onChange={choosePhotos}
            />
          </label>
        </div>
        <div className="status-buttons" role="group" aria-label={`Status of order ${order.id}`}>
          {STATUSES.map((status) => (
            <button
              key={status}
              className={order.status === status ? `status active ${status}` : "status"}
              aria-pressed={order.status === status}
              onClick={() => onChange({ status })}
            >
              {STATUS_LABELS[status]}
            </button>
          ))}
        </div>
      </div>
    </OrderCard>
  );
}

export default function ShopView() {
  const { orders, setOrders, offline, presence, refresh } = useOrders();
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState("");

  // Sends a request, shows what went wrong if it fails, and reloads the orders either way.
  async function send(url: string, init: RequestInit, failure: string) {
    setError("");
    try {
      const res = await fetch(url, init);
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? failure);
      }
    } catch (e) {
      setError(e instanceof TypeError ? failure : (e as Error).message);
    }
    await refresh();
  }

  async function changeOrder(id: number, changes: OrderChanges) {
    setOrders((list) => list?.map((o) => (o.id === id ? { ...o, ...changes } : o)) ?? null);
    await send(
      `/api/orders/${id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      },
      `Could not update order #${id}. Please try again.`,
    );
  }

  async function addPhotos(id: number, files: File[]) {
    const tooBig = files.find((f) => f.size > MAX_PHOTO_MB * 1024 * 1024);
    if (tooBig) return setError(`${tooBig.name} is larger than ${MAX_PHOTO_MB} MB`);

    const body = new FormData();
    files.forEach((file) => body.append("photos", file));
    await send(
      `/api/orders/${id}/photos`,
      { method: "POST", body },
      `Could not add photos to order #${id}. Please try again.`,
    );
  }

  async function removePhoto(photo: OrderFile) {
    if (!window.confirm(`Remove ${photo.name}?`)) return;
    await send(
      `/api/files/${photo.id}`,
      { method: "DELETE" },
      "Could not remove the photo. Please try again.",
    );
  }

  const visible = orders?.filter((o) => filter === "all" || o.status === filter);
  const count = (f: Filter) =>
    orders?.filter((o) => f === "all" || o.status === f).length ?? 0;

  return (
    <main className="page">
      <Header
        title="Print Orders · Shop"
        status={<PresenceStatus presence={presence} role="shop" />}
      />
      <OfflineBanner show={offline} />
      <UnreadBanner orders={orders} />
      {error && <p className="banner error" role="alert">{error}</p>}

      <div className="tabs" role="group" aria-label="Filter orders">
        {(["all", ...STATUSES] as Filter[]).map((f) => (
          <button
            key={f}
            className={filter === f ? "tab active" : "tab"}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All" : STATUS_LABELS[f]}
            <span>{count(f)}</span>
          </button>
        ))}
      </div>

      {orders === null && <p className="empty">Loading…</p>}
      {visible?.length === 0 && <p className="empty">No orders here.</p>}

      <div className="shop-grid">
        {visible?.map((order) => (
          <ShopOrder
            key={order.id}
            order={order}
            presence={presence}
            onChange={(changes) => changeOrder(order.id, changes)}
            onAddPhotos={(files) => addPhotos(order.id, files)}
            onRemovePhoto={removePhoto}
            onChatClosed={refresh}
          />
        ))}
      </div>
    </main>
  );
}
