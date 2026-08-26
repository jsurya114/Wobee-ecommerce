"use client";

import { formatPaiseAsInr } from "@woobe/utils";
import { Badge, Card, Skeleton } from "@woobe/ui";
import { ChevronRight, PackageSearch } from "lucide-react";
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
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }

  if (status !== "authenticated") {
    return null; // redirect effect above is already firing
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <PackageSearch className="h-10 w-10 text-text-secondary" strokeWidth={1.25} aria-hidden="true" />
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
          <Link href={`/order-confirmation/${order.id}`} className="block">
            <Card className="flex items-center justify-between gap-3 p-4 transition-colors hover:border-primary">
              <div className="min-w-0">
                <p className="truncate font-body text-sm font-medium text-text-primary">{order.orderNumber}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <Badge variant={statusVariant(order.status)}>{order.status.replace(/_/g, " ").toLowerCase()}</Badge>
                  <span className="font-body text-xs text-text-secondary">
                    {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-body text-sm font-medium text-text-primary">{formatPaiseAsInr(order.totalPaise)}</span>
                <ChevronRight className="h-4 w-4 text-text-secondary" aria-hidden="true" />
              </div>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function statusVariant(status: string): "success" | "error" | "neutral" {
  if (status === "CONFIRMED" || status === "DELIVERED") return "success";
  if (status === "PAYMENT_FAILED" || status === "CANCELLED") return "error";
  return "neutral";
}
