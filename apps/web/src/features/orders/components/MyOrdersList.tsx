"use client";

import { formatPaiseAsInr } from "@woobe/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import * as ordersApi from "../api/orders.client";
import type { OrderSummary } from "../api/orders.client";

/**
 * "My Orders" (Week 1 Day 5) — status only, no returns/refunds UI yet
 * (week1_excecution_prompt.md's explicit scope for this week). Logged-in
 * only, same protected-route pattern as AccountView.
 */
export function MyOrdersList() {
  const router = useRouter();
  const { accessToken, status } = useAuth();
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated" || !accessToken) return;
    let cancelled = false;
    void ordersApi.listMyOrders(accessToken).then((result) => {
      if (!cancelled) setOrders(result.orders);
    });
    return () => {
      cancelled = true;
    };
  }, [status, accessToken]);

  if (status === "loading" || (status === "authenticated" && orders === null)) {
    return <p className="py-16 text-center font-body text-sm text-text-secondary">Loading your orders…</p>;
  }

  if (status !== "authenticated") {
    return null; // redirect effect above is already firing
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="font-body text-sm text-text-secondary">You haven&apos;t placed any orders yet.</p>
        <Link href="/products" className="font-body text-sm text-primary hover:underline">
          Start shopping
        </Link>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {orders.map((order) => (
        <li key={order.id}>
          <Link
            href={`/order-confirmation/${order.id}`}
            className="flex items-center justify-between rounded-card border border-border bg-surface p-4 hover:border-primary"
          >
            <div>
              <p className="font-body text-sm font-medium text-text-primary">{order.orderNumber}</p>
              <p className="font-body text-xs text-text-secondary">
                {order.itemCount} item{order.itemCount === 1 ? "" : "s"} · {order.status.replace(/_/g, " ").toLowerCase()}
              </p>
            </div>
            <span className="font-body text-sm text-text-primary">{formatPaiseAsInr(order.totalPaise)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
