import { CheckCircle2, Circle, XCircle } from "lucide-react";
import type { OrderView } from "@/features/checkout/api/checkout.client";

/**
 * Week 3 Day 7 — "Order shipping information"/"Shipment status" (week3.md's
 * customer scope). Mirrors admin's own `OrderTimeline` (same steps, same
 * "done" logic keyed off `order.status`, same date-if-known display) —
 * this system has no separate Shipment entity (Order.status IS the
 * shipment lifecycle, PROCESSING → SHIPPED → DELIVERED, see
 * ShipOrderUseCase/DeliverOrderUseCase's own doc comments), so there is no
 * second source of truth to keep this in sync with. Previously the
 * customer-facing detail page only showed carrier/tracking number when
 * present, with no dates and no sense of where the order actually is.
 */
function Step({ label, at, done, failed }: { label: string; at: string | null; done: boolean; failed?: boolean }) {
  const Icon = failed ? XCircle : done ? CheckCircle2 : Circle;
  return (
    <div className="flex items-center gap-3">
      <Icon className={`h-4 w-4 shrink-0 ${failed ? "text-error" : done ? "text-success" : "text-text-secondary"}`} aria-hidden="true" />
      <span className={`font-body text-sm ${done ? "text-text-primary" : "text-text-secondary"}`}>{label}</span>
      {at ? <span className="font-body text-xs text-text-secondary">{new Date(at).toLocaleDateString()}</span> : null}
    </div>
  );
}

export function OrderTimeline({ order }: { order: OrderView }) {
  if (order.status === "CANCELLED") {
    return (
      <div className="flex flex-col gap-2">
        <Step label="Placed" at={order.placedAt} done />
        <Step label={`Cancelled${order.cancellationReason ? ` — ${order.cancellationReason}` : ""}`} at={order.cancelledAt} done failed />
      </div>
    );
  }
  if (order.status === "PAYMENT_FAILED") {
    return (
      <div className="flex flex-col gap-2">
        <Step label="Placed" at={order.placedAt} done />
        <Step label="Payment failed" at={null} done failed />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Step label="Placed" at={order.placedAt} done />
      <Step label="Confirmed" at={null} done={order.status !== "PENDING_PAYMENT"} />
      <Step label="Processing" at={null} done={["PROCESSING", "SHIPPED", "DELIVERED"].includes(order.status)} />
      <Step label={order.carrier ? `Shipped via ${order.carrier}` : "Shipped"} at={order.shippedAt} done={["SHIPPED", "DELIVERED"].includes(order.status)} />
      <Step label="Delivered" at={order.deliveredAt} done={order.status === "DELIVERED"} />
    </div>
  );
}
