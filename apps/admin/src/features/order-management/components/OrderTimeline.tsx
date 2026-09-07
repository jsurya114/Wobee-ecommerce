import { CheckCircle2, Circle, XCircle } from "lucide-react";
import type { AdminOrderView } from "../api/admin-orders.client";

function Step({ label, at, done, failed }: { label: string; at: string | null; done: boolean; failed?: boolean }) {
  const Icon = failed ? XCircle : done ? CheckCircle2 : Circle;
  return (
    <div className="flex items-center gap-3">
      <Icon className={`h-4 w-4 ${failed ? "text-error" : done ? "text-success" : "text-text-secondary"}`} aria-hidden="true" />
      <span className={`font-body text-sm ${done ? "text-text-primary" : "text-text-secondary"}`}>{label}</span>
      {at ? <span className="font-body text-xs text-text-secondary">{new Date(at).toLocaleString()}</span> : null}
    </div>
  );
}

export function OrderTimeline({ order }: { order: AdminOrderView }) {
  if (order.status === "CANCELLED") {
    return (
      <div className="flex flex-col gap-2">
        <Step label="Placed" at={order.placedAt} done />
        <Step label={`Cancelled${order.cancellationReason ? ` — ${order.cancellationReason}` : ""}`} at={order.cancelledAt} done failed />
      </div>
    );
  }
  if (order.status === "RETURNED_TO_ORIGIN") {
    return (
      <div className="flex flex-col gap-2">
        <Step label="Placed" at={order.placedAt} done />
        <Step label={order.carrier ? `Shipped via ${order.carrier}` : "Shipped"} at={order.shippedAt} done />
        <Step label="Returned to origin — delivery failed" at={null} done failed />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Step label="Placed" at={order.placedAt} done />
      <Step label="Confirmed" at={null} done={order.status !== "PENDING_PAYMENT" && order.status !== "PAYMENT_FAILED"} />
      <Step label="Processing" at={null} done={["PROCESSING", "PACKED", "SHIPPED", "DELIVERED"].includes(order.status)} />
      <Step label="Packed" at={null} done={["PACKED", "SHIPPED", "DELIVERED"].includes(order.status)} />
      <Step label={order.carrier ? `Shipped via ${order.carrier}` : "Shipped"} at={order.shippedAt} done={["SHIPPED", "DELIVERED"].includes(order.status)} />
      <Step label="Delivered" at={order.deliveredAt} done={order.status === "DELIVERED"} />
    </div>
  );
}
