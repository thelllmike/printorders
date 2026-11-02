"use client";

import { type ReactNode, useState } from "react";
import type { Role } from "@/lib/auth";
import type { Order, OrderFile, Presence } from "@/lib/types";
import { FilePreview } from "./FilePreview";
import { OrderChat } from "./OrderChat";
import { PdfThumbnail } from "./PdfThumbnail";

export function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// Shows the other side: the customer sees the shop, and the shop sees the customer.
export function PresenceStatus({ presence, role }: { presence: Presence | null; role: Role }) {
  if (!presence) return null;
  const name = role === "shop" ? "Customer" : "Shop";
  return (
    <span className={presence.online ? "presence online" : "presence"}>
      <span className="presence-dot" aria-hidden="true" />
      {presence.online
        ? `${name} is online`
        : presence.lastSeen
          ? `${name} last seen ${formatDate(presence.lastSeen)}`
          : `${name} hasn't been online yet`}
    </span>
  );
}

export function Header({ title, status }: { title: string; status: ReactNode }) {
  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <header className="header">
      <div>
        <h1>{title}</h1>
        {status}
      </div>
      <button className="link" onClick={logout}>Log out</button>
    </header>
  );
}

export function OfflineBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p className="banner" role="status">
      Connection lost. Showing the last update, retrying…
    </p>
  );
}

export function UnreadBanner({ orders }: { orders: Order[] | null }) {
  const unread = orders?.filter((o) => o.unreadMessages > 0) ?? [];
  if (unread.length === 0) return null;
  return (
    <p className="banner" role="status">
      New messages on {unread.map((o) => `order #${o.id}`).join(", ")}
    </p>
  );
}

function FileRow({ file, onOpen }: { file: OrderFile; onOpen: () => void }) {
  const url = `/api/files/${file.id}`;
  return (
    <li className="file">
      <button className="thumb" onClick={onOpen} aria-label={`Preview ${file.name}`}>
        {file.mime.startsWith("image/") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" loading="lazy" />
        ) : (
          <PdfThumbnail id={file.id} />
        )}
      </button>
      <div className="file-details">
        <div className="file-info">
          <button onClick={onOpen}>{file.name}</button>
          <span>{formatSize(file.size)}</span>
        </div>
        <a className="link" href={`${url}?download`}>Download</a>
      </div>
    </li>
  );
}

export function CopiesProgress({ printed, total }: { printed: number; total: number }) {
  return (
    <div className="copies">
      <span>Printed {printed} of {total}</span>
      <div className="progress" aria-hidden="true">
        <div style={{ width: `${(printed / total) * 100}%` }} />
      </div>
    </div>
  );
}

export function OrderCard({
  order,
  role,
  presence,
  onChatClosed,
  onRemovePhoto,
  children,
}: {
  order: Order;
  role: Role;
  presence: Presence | null;
  onChatClosed: () => void;
  onRemovePhoto?: (photo: OrderFile) => void;
  children: ReactNode;
}) {
  const [preview, setPreview] = useState<OrderFile | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <article className="card order">
      <div className="order-top">
        <div>
          <h3>Order #{order.id}</h3>
          <time dateTime={order.createdAt}>{formatDate(order.createdAt)}</time>
        </div>
        <div className="quantity">
          <strong>{order.quantity}</strong>
          <span>{order.quantity === 1 ? "copy" : "copies"}</span>
        </div>
      </div>
      <ul className="files">
        {order.files.map((file) => (
          <FileRow key={file.id} file={file} onOpen={() => setPreview(file)} />
        ))}
      </ul>
      {order.note && (
        <div className="note">
          <span>Note</span>
          <p>{order.note}</p>
        </div>
      )}
      {order.photos.length > 0 && (
        <div>
          <h4 className="section-title">Finished work</h4>
          <ul className="photos">
            {order.photos.map((photo) => (
              <li key={photo.id}>
                <button
                  className="photo"
                  onClick={() => setPreview(photo)}
                  aria-label={`Preview ${photo.name}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/files/${photo.id}`} alt="" loading="lazy" />
                </button>
                {onRemovePhoto && (
                  <button
                    className="link"
                    aria-label={`Remove ${photo.name}`}
                    onClick={() => onRemovePhoto(photo)}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {children}
      <button className="tool chat-button" onClick={() => setChatOpen(true)}>
        {role === "shop" ? "Chat with customer" : "Chat with shop"}
        {order.unreadMessages > 0 && (
          <span className="unread" aria-label={`${order.unreadMessages} new`}>
            {order.unreadMessages}
          </span>
        )}
      </button>
      {preview && <FilePreview file={preview} onClose={() => setPreview(null)} />}
      {chatOpen && (
        <OrderChat
          orderId={order.id}
          role={role}
          status={<PresenceStatus presence={presence} role={role} />}
          onClose={() => {
            setChatOpen(false);
            onChatClosed();
          }}
        />
      )}
    </article>
  );
}
