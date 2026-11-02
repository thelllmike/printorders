"use client";

import { useCallback, useEffect, useState } from "react";
import type { Order } from "@/lib/types";

const REFRESH_MS = 5000;

export function useOrders() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [offline, setOffline] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/orders", { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setOrders(data.orders);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [refresh]);

  return { orders, setOrders, offline, refresh };
}
