"use client";

import { useState } from "react";
import { STATUSES, STATUS_LABELS, type Status } from "@/lib/types";
import { Header, OfflineBanner, OrderCard } from "./shared";
import { useOrders } from "./useOrders";

type Filter = Status | "all";

export default function ShopView() {
  const { orders, setOrders, offline, refresh } = useOrders();
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState("");

  async function changeStatus(id: number, status: Status) {
    setError("");
    setOrders((list) => list?.map((o) => (o.id === id ? { ...o, status } : o)) ?? null);
    try {
      const res = await fetch(`/api/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error();
    } catch {
      setError(`Could not update order #${id}. Please try again.`);
    }
    await refresh();
  }

  const visible = orders?.filter((o) => filter === "all" || o.status === filter);
  const count = (f: Filter) =>
    orders?.filter((o) => f === "all" || o.status === f).length ?? 0;

  return (
    <main className="page">
      <Header title="Print Orders · Shop" />
      <OfflineBanner show={offline} />
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
          <OrderCard key={order.id} order={order}>
            <div className="status-buttons" role="group" aria-label={`Status of order ${order.id}`}>
              {STATUSES.map((status) => (
                <button
                  key={status}
                  className={order.status === status ? `status active ${status}` : "status"}
                  aria-pressed={order.status === status}
                  onClick={() => changeStatus(order.id, status)}
                >
                  {STATUS_LABELS[status]}
                </button>
              ))}
            </div>
          </OrderCard>
        ))}
      </div>
    </main>
  );
}
