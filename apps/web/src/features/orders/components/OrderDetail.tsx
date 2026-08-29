"use client";

import { formatPaiseAsInr } from "@woobe/utils";
import { Badge, Card, Skeleton } from "@woobe/ui";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { RequestReturnForm } from "@/features/returns/components/RequestReturnForm";
import * as returnsApi from "@/features/returns/api/returns.client";
import type { ReturnSummary } from "@/features/returns/api/returns.client";
import type { OrderView } from "@/features/checkout/api/checkout.client";
import * as ordersApi from "../api/orders.client";
import { OrderStatusBadge } from "./OrderStatusBadge";

/**
 * The customer's own order detail (distinct from `/order-confirmation/[id]`,
 * which is the one-time post-checkout page that drives payment to
 * completion — this is what "My Orders" links to for a look back later).
 * New for Week 2 Day 6 (week2 (1).md §11): shows this order's own returns
 * and, once DELIVERED, a way to request a new one.
 */
export function OrderDetail({ orderId }: { orderId: string }) {
  const { accessToken, status: authStatus } = useAuth();
  const [order, setOrder] = useState<OrderView | null>(null);
  const [returns, setReturns] = useState<ReturnSummary[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const refetch = useCallback(async () => {
    try {
      const [freshOrder, returnsResult] = await Promise.all([
        ordersApi.getOrder(orderId, accessToken ?? undefined),
        accessToken ? returnsApi.listMyReturns(accessToken, orderId) : Promise.resolve({ returns: [] }),
      ]);
      setOrder(freshOrder);
      setReturns(returnsResult.returns);
    } catch {
      setLoadError(true);
    }
  }, [orderId, accessToken]);

  useEffect(() => {
    if (authStatus === "loading") return;
    void refetch();
  }, [refetch, authStatus]);

  if (loadError) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <p className="font-body text-sm text-text-secondary">We couldn&apos;t find that order.</p>
        <Link href="/account/orders" className="font-body text-sm text-primary hover:underline">
          Back to my orders
        </Link>
      </div>
    );
  }

  if (!order || returns === null) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const hasUnresolvedReturn = returns.some((r) => r.status !== "RETURN_REJECTED" && r.status !== "REFUNDED");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl text-text-primary">{order.orderNumber}</h1>
        <OrderStatusBadge status={order.status} />
      </div>

      <Card className="p-4">
        <h2 className="mb-3 font-body text-sm font-medium text-text-primary">Items</h2>
        <div className="flex flex-col gap-2">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between font-body text-sm">
              <span className="text-text-primary">
                {item.productNameSnapshot} · {item.color} · {item.size} × {item.quantity}
              </span>
              <span className="text-text-primary">{formatPaiseAsInr(item.lineTotalPaise)}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-between border-t border-border pt-3 font-body text-base font-medium">
          <span className="text-text-primary">Total</span>
          <span className="text-text-primary">{formatPaiseAsInr(order.totalPaise)}</span>
        </div>
      </Card>

      {order.trackingNumber ? (
        <Card className="flex justify-between p-4 font-body text-sm">
          <span className="text-text-secondary">Tracking</span>
          <span className="text-text-primary">
            {order.carrier} · {order.trackingNumber}
          </span>
        </Card>
      ) : null}

      {returns.length > 0 ? (
        <Card className="p-4">
          <h2 className="mb-3 font-body text-sm font-medium text-text-primary">Returns</h2>
          <ul className="flex flex-col gap-2">
            {returns.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2">
                <span className="truncate font-body text-sm text-text-primary">{r.reason}</span>
                <ReturnStatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {order.status === "DELIVERED" ? (
        <Card className="p-4">
          <h2 className="mb-3 font-body text-sm font-medium text-text-primary">Request a return</h2>
          {hasUnresolvedReturn ? (
            // Deliberate UI-level simplification, not a server rule: the API
            // itself allows a separate return per order item even while
            // another is in flight (RequestReturnUseCase checks eligibility
            // per line, not per order) — the storefront just keeps the form
            // to one in-flight return at a time here to avoid needing every
            // existing return's own line items just to compute what's still
            // returnable per item.
            <p className="font-body text-sm text-text-secondary">
              You already have a return in progress for this order — you can request another once it&apos;s resolved.
            </p>
          ) : (
            <RequestReturnForm orderId={order.id} items={order.items} onRequested={() => void refetch()} />
          )}
        </Card>
      ) : null}
    </div>
  );
}

function ReturnStatusBadge({ status }: { status: ReturnSummary["status"] }) {
  const label = status.replace(/_/g, " ").toLowerCase();
  if (status === "REFUNDED") return <Badge variant="success">{label}</Badge>;
  if (status === "RETURN_REJECTED") return <Badge variant="error">{label}</Badge>;
  return <Badge variant="neutral">{label}</Badge>;
}
