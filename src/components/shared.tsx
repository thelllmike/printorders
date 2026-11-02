"use client";

import type { ReactNode } from "react";
import type { Order, OrderFile } from "@/lib/types";

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

export function Header({ title }: { title: string }) {
  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <header className="header">
      <h1>{title}</h1>
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

function FileRow({ file }: { file: OrderFile }) {
  const url = `/api/files/${file.id}`;
  return (
    <li className="file">
      <a className="thumb" href={url} target="_blank" rel="noreferrer" aria-label={`Open ${file.name}`}>
        {file.mime.startsWith("image/") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" loading="lazy" />
        ) : (
          <span className="pdf-tag">PDF</span>
        )}
      </a>
      <div className="file-info">
        <a href={url} target="_blank" rel="noreferrer">{file.name}</a>
        <span>{formatSize(file.size)}</span>
      </div>
      <a className="link" href={`${url}?download`}>Download</a>
    </li>
  );
}

export function OrderCard({ order, children }: { order: Order; children: ReactNode }) {
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
        {order.files.map((file) => <FileRow key={file.id} file={file} />)}
      </ul>
      {order.note && (
        <div className="note">
          <span>Note</span>
          <p>{order.note}</p>
        </div>
      )}
      {children}
    </article>
  );
}
