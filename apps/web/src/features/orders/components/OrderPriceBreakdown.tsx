import { formatGrams, formatPaiseAsInr, formatPaiseAsInrCompact } from "@woobe/utils";
import type { OrderView } from "@/features/checkout/api/checkout.client";

/**
 * The authoritative order money breakdown (redesign spec §E/§I) — shown on
 * the order-confirmation and order-detail pages, which previously showed
 * only the grand total. Every value comes straight from `OrderView` (the
 * API already returns subtotal / discount / shipping / tax / weight and
 * per-item weight·rate) — nothing is computed here.
 */
export function OrderPriceBreakdown({ order }: { order: OrderView }) {
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {order.items.map((item) => (
          <li key={item.id} className="flex justify-between gap-3 font-body text-sm">
            <div className="min-w-0">
              <p className="truncate text-text-primary">{item.productNameSnapshot}</p>
              <p className="text-micro text-text-secondary">
                {item.color} · {item.size}
                {/* Null unitRatePerKgPaise (2026-08-31) = a FIXED-category line — weight didn't determine this price. */}
                {item.unitRatePerKgPaise !== null ? ` · ${formatGrams(item.weightGrams)} · ${formatPaiseAsInrCompact(item.unitRatePerKgPaise)}/kg` : ""}
                {` · ×${item.quantity}`}
              </p>
            </div>
            <span className="shrink-0 text-text-primary">{formatPaiseAsInr(item.lineTotalPaise)}</span>
          </li>
        ))}
      </ul>

      <dl className="flex flex-col gap-1.5 border-t border-border pt-3 font-body text-sm">
        <div className="flex justify-between">
          <dt className="text-text-secondary">Subtotal</dt>
          <dd className="text-text-primary">{formatPaiseAsInr(order.subtotalPaise)}</dd>
        </div>
        {order.discountPaise > 0 ? (
          <div className="flex justify-between">
            <dt className="text-text-secondary">Discount</dt>
            <dd className="text-success">-{formatPaiseAsInr(order.discountPaise)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between">
          <dt className="text-text-secondary">Shipping</dt>
          <dd className="text-text-primary">
            {order.shippingFeePaise === 0 ? "Free" : formatPaiseAsInr(order.shippingFeePaise)}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-text-secondary">Tax</dt>
          <dd className="text-text-primary">{formatPaiseAsInr(order.taxPaise)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-text-secondary">Total weight</dt>
          <dd className="text-text-primary">{formatGrams(order.totalWeightGrams)}</dd>
        </div>
      </dl>

      <div className="flex justify-between border-t border-border pt-3 font-body text-base font-semibold">
        <span className="text-text-primary">Total</span>
        <span className="text-text-primary">{formatPaiseAsInr(order.totalPaise)}</span>
      </div>
    </div>
  );
}
