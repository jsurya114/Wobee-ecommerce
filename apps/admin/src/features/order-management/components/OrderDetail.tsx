"use client";

import { formatPaiseAsInr } from "@woobe/utils";
import { Badge, Card } from "@woobe/ui";
import { useAdminOrder } from "../hooks/useAdminOrder";
import { OrderStatusActions } from "./OrderStatusActions";
import { OrderTimeline } from "./OrderTimeline";

export function OrderDetail({ orderId }: { orderId: string }) {
  const { order, loading, error, startProcessing, ship, deliver, cancel, lastRefundIssued } = useAdminOrder(orderId);

  if (loading) {
    return <p className="py-12 text-center font-body text-sm text-text-secondary">Loading…</p>;
  }
  if (error) {
    return <p className="py-12 text-center font-body text-sm text-error">{error}</p>;
  }
  if (!order) {
    return <p className="py-12 text-center font-body text-sm text-text-secondary">Order not found.</p>;
  }

  return (
    <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-xl text-text-primary">{order.orderNumber}</h1>
          <Badge variant="neutral">{order.status.replace(/_/g, " ").toLowerCase()}</Badge>
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
          <div className="mt-3 flex flex-col gap-1 border-t border-border pt-3 font-body text-sm">
            <div className="flex justify-between text-text-secondary">
              <span>Subtotal</span>
              <span>{formatPaiseAsInr(order.subtotalPaise)}</span>
            </div>
            <div className="flex justify-between text-text-secondary">
              <span>Shipping</span>
              <span>{formatPaiseAsInr(order.shippingFeePaise)}</span>
            </div>
            <div className="flex justify-between text-text-secondary">
              <span>Tax</span>
              <span>{formatPaiseAsInr(order.taxPaise)}</span>
            </div>
            <div className="flex justify-between font-medium text-text-primary">
              <span>Total</span>
              <span>{formatPaiseAsInr(order.totalPaise)}</span>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 font-body text-sm font-medium text-text-primary">Contact & shipping</h2>
          <dl className="flex flex-col gap-1 font-body text-sm">
            <div className="flex justify-between"><dt className="text-text-secondary">Name</dt><dd className="text-text-primary">{order.contactName}</dd></div>
            <div className="flex justify-between"><dt className="text-text-secondary">Phone</dt><dd className="text-text-primary">{order.contactPhone}</dd></div>
            <div className="flex justify-between"><dt className="text-text-secondary">Email</dt><dd className="text-text-primary">{order.contactEmail}</dd></div>
            <div className="flex justify-between"><dt className="text-text-secondary">Address</dt><dd className="text-right text-text-primary">{order.shippingSnapshot.line1}, {order.shippingSnapshot.city}, {order.shippingSnapshot.state} {order.shippingSnapshot.pincode}</dd></div>
            <div className="flex justify-between"><dt className="text-text-secondary">Payment method</dt><dd className="text-text-primary">{order.paymentMethod === "COD" ? "Cash on delivery" : "Razorpay"}</dd></div>
          </dl>
        </Card>

        <OrderStatusActions
          order={order}
          onStartProcessing={startProcessing}
          onShip={ship}
          onDeliver={deliver}
          onCancel={cancel}
          lastRefundIssued={lastRefundIssued}
        />
      </div>

      <Card className="h-fit p-4">
        <h2 className="mb-3 font-body text-sm font-medium text-text-primary">Timeline</h2>
        <OrderTimeline order={order} />
      </Card>
    </div>
  );
}
