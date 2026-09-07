"use client";

import { formatPaiseAsInr } from "@woobe/utils";
import { Button, Card, EmptyState, Skeleton } from "@woobe/ui";
import { AlertTriangle, ChevronLeft, ChevronRight, PackageSearch } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import type { OrderView } from "@/features/checkout/api/checkout.client";
import { OrderStatusBadge } from "@/features/orders/components/OrderStatusBadge";
import { OrderTimeline } from "@/features/orders/components/OrderTimeline";
import * as ordersApi from "@/features/orders/api/orders.client";
import type { OrderSummary } from "@/features/orders/api/orders.client";

/**
 * Order statuses that count as "still in progress" for Help & Support's
 * default order list — the real `OrderStatus` values (schema.prisma), not
 * invented ones. PENDING_PAYMENT/PAYMENT_FAILED aren't included: those are
 * pre-fulfillment states, not "where is my order" support cases. DELIVERED
 * and CANCELLED are deliberately excluded from the default view per the
 * brief ("do not show products that have already been delivered if the
 * purpose is specifically an order-in-progress query") — "Show all orders"
 * below removes this filter for anyone who still wants an older order.
 * RETURNED_TO_ORIGIN (2026-09-06 order-processing checkpoints) is included
 * here even though it's a terminal branch in `OrderTimeline`/
 * `OrderStatusBadge` (error-styled, not success-styled like DELIVERED) —
 * a failed delivery is exactly the kind of thing a customer wants Help &
 * Support to surface, not hide alongside successfully completed orders.
 */
const IN_PROGRESS_STATUSES = new Set(["CONFIRMED", "PROCESSING", "PACKED", "SHIPPED", "RETURNED_TO_ORIGIN"]);

/**
 * "Order Queries" (Help & Support → Orders & Delivery). Reuses the exact
 * same authenticated API calls as "My Orders" (`ordersApi.listMyOrders` /
 * `ordersApi.getOrder`) and the exact same status-progress rendering
 * (`OrderTimeline`/`OrderStatusBadge`, already shared with
 * `/account/orders/[id]`) — no second order-status system, no new backend
 * endpoint. Ownership is enforced entirely server-side (both endpoints key
 * off the caller's own verified access token, never a client-supplied id —
 * see `GetOrderUseCase`/`ListMyOrdersUseCase`'s own doc comments) so this
 * component only ever sees the authenticated user's own orders.
 */
export function HelpOrderQueries() {
  const { accessToken, status: authStatus } = useAuth();
  const [orders, setOrders] = useState<OrderSummary[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const fetchOrders = useCallback(() => {
    if (!accessToken) return;
    setLoadError(false);
    setOrders(null);
    ordersApi
      .listMyOrders(accessToken)
      .then((result) => setOrders(result.orders))
      .catch(() => setLoadError(true));
  }, [accessToken]);

  useEffect(() => {
    if (authStatus === "authenticated" && accessToken) fetchOrders();
    // Deliberately not depending on fetchOrders here beyond mount/auth-change —
    // fetchOrders itself is stable across renders that don't change accessToken.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, accessToken]);

  if (authStatus === "loading") {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    );
  }

  // Guest — no secure guest order-lookup exists for Help & Support (returns/
  // order-history have no guest path, ADR-011: guest identity doesn't
  // persist across sessions). Rather than build a weaker id-only lookup,
  // guests get a log-in prompt here; general policy content is unaffected.
  if (authStatus !== "authenticated") {
    return (
      <EmptyState
        icon={<PackageSearch />}
        title="Log in to see your orders"
        description="Order tracking and delivery status are shown for your own account only."
        action={
          <Link href="/login" className="font-body text-sm font-medium text-primary hover:underline">
            Log in
          </Link>
        }
      />
    );
  }

  if (selectedOrderId) {
    return <HelpOrderDetail orderId={selectedOrderId} onBack={() => setSelectedOrderId(null)} />;
  }

  if (orders === null && !loadError) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <AlertTriangle className="h-8 w-8 text-error" strokeWidth={1.25} aria-hidden="true" />
        <p className="font-body text-sm text-text-secondary">We couldn&apos;t load your orders. Please try again.</p>
        <Button type="button" variant="secondary" size="sm" onClick={fetchOrders}>
          Retry
        </Button>
      </div>
    );
  }

  const allOrders = orders ?? [];
  const visible = showAll ? allOrders : allOrders.filter((o) => IN_PROGRESS_STATUSES.has(o.status));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-lg text-text-primary">Orders &amp; Delivery</h2>
        <p className="mt-1 font-body text-sm text-text-secondary">Select an order to see its current status and get help.</p>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<PackageSearch />}
          title={showAll ? "You haven't placed any orders yet" : "No orders currently in progress"}
          description={!showAll && allOrders.length > 0 ? "Delivered or cancelled orders are hidden here." : undefined}
          action={
            !showAll && allOrders.length > 0 ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => setShowAll(true)}>
                Show all orders
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {visible.map((order) => (
              <li key={order.id}>
                <button type="button" onClick={() => setSelectedOrderId(order.id)} className="block w-full text-left">
                  <Card className="flex items-center justify-between gap-3 p-4 transition-colors hover:border-primary">
                    <div className="min-w-0">
                      <p className="truncate font-body text-sm font-medium text-text-primary">{order.orderNumber}</p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <OrderStatusBadge status={order.status} />
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
                </button>
              </li>
            ))}
          </ul>
          {!showAll && allOrders.length > visible.length ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="self-start font-body text-sm text-primary hover:underline"
            >
              Show all orders
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * Selected-order view — fetches the SAME `getOrder` the order-confirmation
 * and `/account/orders/[id]` pages use, and renders the SAME
 * `OrderTimeline`/`OrderStatusBadge` those pages already use. Lists every
 * product on the order (real `OrderItemView` data — name/color/size/qty)
 * so a multi-product order's items are individually identifiable; the
 * shipment/status progress shown below applies to the whole order (this
 * schema has no per-item status — `Order.status` is the one real state
 * machine, see schema.prisma's own comment on `Return` being the item-level
 * entity instead).
 */
function HelpOrderDetail({ orderId, onBack }: { orderId: string; onBack: () => void }) {
  const { accessToken } = useAuth();
  const [order, setOrder] = useState<OrderView | null>(null);
  const [loadError, setLoadError] = useState(false);

  const fetchOrder = useCallback(() => {
    if (!accessToken) return;
    setLoadError(false);
    setOrder(null);
    ordersApi.getOrder(orderId, accessToken).then(setOrder).catch(() => setLoadError(true));
  }, [orderId, accessToken]);

  useEffect(() => {
    fetchOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, accessToken]);

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 self-start font-body text-sm text-primary hover:underline"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Back to your orders
      </button>

      {loadError ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="font-body text-sm text-text-secondary">We couldn&apos;t load this order.</p>
          <Button type="button" variant="secondary" size="sm" onClick={fetchOrder}>
            Retry
          </Button>
        </div>
      ) : !order ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-16" />
          <Skeleton className="h-24" />
          <Skeleton className="h-32" />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg text-text-primary">{order.orderNumber}</h2>
            <OrderStatusBadge status={order.status} />
          </div>

          <Card className="p-4">
            <h3 className="mb-3 font-body text-sm font-medium text-text-primary">Products in this order</h3>
            <ul className="flex flex-col gap-2">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate font-body text-sm text-text-primary">{item.productNameSnapshot}</span>
                  <span className="shrink-0 font-body text-xs text-text-secondary">
                    {item.color} · {item.size} · Qty {item.quantity}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-4">
            <h3 className="mb-3 font-body text-sm font-medium text-text-primary">Order progress</h3>
            <OrderTimeline order={order} />
          </Card>

          {order.trackingNumber ? (
            <Card className="flex justify-between p-4 font-body text-sm">
              <span className="text-text-secondary">Tracking</span>
              <span className="text-text-primary">
                {order.carrier} · {order.trackingNumber}
              </span>
            </Card>
          ) : null}

          <div className="flex flex-col gap-2">
            {order.status === "DELIVERED" ? (
              <Link href={`/account/orders/${order.id}`} className="font-body text-sm font-medium text-primary hover:underline">
                Request a return for this order →
              </Link>
            ) : null}
            <Link href={`/account/orders/${order.id}`} className="font-body text-sm font-medium text-primary hover:underline">
              View full order details →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
