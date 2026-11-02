"use client";

import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Role } from "@/lib/auth";
import { MAX_MESSAGE_LENGTH, type Message } from "@/lib/types";

const REFRESH_MS = 3000;

const SENDER_NAMES: Record<Role, string> = { customer: "Customer", shop: "Shop" };

function formatTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function OrderChat({
  orderId,
  role,
  status,
  onClose,
}: {
  orderId: number;
  role: Role;
  status: ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const url = `/api/orders/${orderId}/messages`;
  const count = messages?.length ?? 0;

  const load = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json();
      // A slow refresh can finish after a send, so never go back to a shorter list.
      setMessages((current) =>
        current && data.messages.length < current.length ? current : data.messages,
      );
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, [url]);

  useEffect(() => {
    dialog.current?.showModal();
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [count]);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    setError("");
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Could not send. Please try again.");
      }
      setDraft("");
      await load();
    } catch (e) {
      setError(e instanceof TypeError ? "Could not send. Please try again." : (e as Error).message);
    }
    setSending(false);
  }

  function pressKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  return (
    <dialog
      ref={dialog}
      className="preview chat"
      aria-label={`Chat about order ${orderId}`}
      onClose={onClose}
    >
      <div className="preview-bar">
        <div className="chat-title">
          <strong>Order #{orderId} chat</strong>
          {status}
        </div>
        <button className="link" onClick={() => dialog.current?.close()}>Close</button>
      </div>

      <ol className="messages" ref={list} aria-live="polite">
        {messages === null && !offline && <li className="preview-message">Loading…</li>}
        {messages?.length === 0 && (
          <li className="preview-message">No messages yet. Write the first one below.</li>
        )}
        {messages?.map((message) => {
          const mine = message.sender === role;
          return (
            <li key={message.id} className={mine ? "message mine" : "message"}>
              <p>{message.text}</p>
              <span>
                {mine ? "You" : SENDER_NAMES[message.sender]} · {formatTime(message.createdAt)}
              </span>
            </li>
          );
        })}
      </ol>

      {offline && <p className="banner chat-banner" role="status">Connection lost, retrying…</p>}
      {error && <p className="banner error chat-banner" role="alert">{error}</p>}

      <form className="chat-form" onSubmit={send}>
        <textarea
          rows={2}
          aria-label="Message"
          placeholder="Write a message"
          maxLength={MAX_MESSAGE_LENGTH}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={pressKey}
        />
        <button className="tool save" disabled={sending || !draft.trim()}>
          {sending ? "Sending…" : "Send"}
        </button>
      </form>
    </dialog>
  );
}
