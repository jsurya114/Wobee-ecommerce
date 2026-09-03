"use client";

import { LoadingState } from "@/features/shell/components/LoadingState";
import { resolveImageUrl } from "@/lib/resolve-image-url";
import { formatGrams, formatPaiseAsInr, formatPaiseAsInrCompact, sumWeightBasedGrams } from "@woobe/utils";
import { Badge, Card } from "@woobe/ui";
import Link from "next/link";
import { useAdminOrder } from "../hooks/useAdminOrder";
import { OrderStatusActions } from "./OrderStatusActions";
import { OrderTimeline } from "./OrderTimeline";

export function OrderDetail({ orderId }: { orderId: string }) {
  const { order, loading, error, startProcessing, ship, deliver, cancel, lastRefundIssued } = useAdminOrder(orderId);

  if (loading) {
    return <LoadingState />;
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-display text-xl text-text-primary">{order.orderNumber}</h1>
          <div className="flex items-center gap-2">
            {order.hasActiveReturn ? (
              <Link href={`/returns?orderId=${order.id}`}>
                <Badge variant="neutral">return requested</Badge>
              </Link>
            ) : null}
            <Badge variant="neutral">{order.status.replace(/_/g, " ").toLowerCase()}</Badge>
          </div>
        </div>

        <Card className="p-4">
          <h2 className="mb-3 font-body text-sm font-medium text-text-primary">Items</h2>
          <ul className="flex flex-col gap-3">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3">
                {item.imageUrl ? (
                  // Plain <img>, not next/image — same reasoning as every other admin thumbnail (CategoriesTable, BannersTable).
                  <img src={resolveImageUrl(item.imageUrl)!} alt="" className="h-14 w-14 shrink-0 rounded-control border border-border object-cover" />
                ) : (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-control border border-border bg-surface-2 font-body text-sm text-text-secondary">
                    {item.productNameSnapshot.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-body text-sm font-medium text-text-primary">{item.productNameSnapshot}</p>
                  <p className="truncate font-body text-xs text-text-secondary">
                    {item.color} · {item.size}
                    {/* Null unitRatePerKgPaise (2026-08-31) = a FIXED-category line — weight didn't determine this price. */}
                    {item.unitRatePerKgPaise !== null
                      ? ` · ${formatGrams(item.weightGrams)} · ${formatPaiseAsInrCompact(item.unitRatePerKgPaise)}/kg`
                      : ""}
                    {` · ×${item.quantity}`}
                  </p>
                </div>
                <span className="shrink-0 font-body text-sm font-semibold text-text-primary">{formatPaiseAsInr(item.lineTotalPaise)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col gap-1.5 border-t border-border pt-3 font-body text-sm">
            <div className="flex justify-between text-text-secondary">
              <span>Subtotal</span>
              <span className="text-text-primary">{formatPaiseAsInr(order.subtotalPaise)}</span>
            </div>
            {order.discountPaise > 0 ? (
              <div className="flex justify-between text-text-secondary">
                <span>Coupon discount</span>
                <span className="text-success">-{formatPaiseAsInr(order.discountPaise)}</span>
              </div>
            ) : null}
            <div className="flex justify-between text-text-secondary">
              <span>Shipping</span>
              <span className="text-text-primary">{order.shippingFeePaise === 0 ? "Free" : formatPaiseAsInr(order.shippingFeePaise)}</span>
            </div>
            <div className="flex justify-between text-text-secondary">
              <span>Tax</span>
              <span className="text-text-primary">{formatPaiseAsInr(order.taxPaise)}</span>
            </div>
            {/* Weight-based items only (ADR-021) — a FIXED-priced accessory's weight never moves this figure, client-review fix 2026-09-04. */}
            <div className="flex justify-between text-text-secondary">
              <span>Total weight</span>
              <span className="text-text-primary">{formatGrams(sumWeightBasedGrams(order.items))}</span>
            </div>
          </div>
          <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3">
            <span className="font-body text-sm font-medium text-text-primary">Total</span>
            <span className="font-display text-xl font-semibold text-text-primary">{formatPaiseAsInr(order.totalPaise)}</span>
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 font-body text-sm font-medium text-text-primary">Contact & shipping</h2>
          <dl className="flex flex-col gap-1 font-body text-sm">
            <div className="flex justify-between gap-3"><dt className="shrink-0 text-text-secondary">Name</dt><dd className="text-right text-text-primary">{order.contactName}</dd></div>
            <div className="flex justify-between gap-3"><dt className="shrink-0 text-text-secondary">Phone</dt><dd className="text-right text-text-primary">{order.contactPhone}</dd></div>
            <div className="flex justify-between gap-3"><dt className="shrink-0 text-text-secondary">Email</dt><dd className="break-all text-right text-text-primary">{order.contactEmail}</dd></div>
            <div className="flex justify-between gap-3"><dt className="shrink-0 text-text-secondary">Address</dt><dd className="text-right text-text-primary">{order.shippingSnapshot.line1}, {order.shippingSnapshot.city}, {order.shippingSnapshot.state} {order.shippingSnapshot.pincode}</dd></div>
            <div className="flex justify-between gap-3"><dt className="shrink-0 text-text-secondary">Payment method</dt><dd className="text-right text-text-primary">{order.paymentMethod === "COD" ? "Cash on delivery" : "Razorpay"}</dd></div>
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
