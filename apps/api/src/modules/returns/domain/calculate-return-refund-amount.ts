export interface RefundableOrderItem {
  orderItemId: string;
  /** The full ordered quantity on this OrderItem — not the returned quantity — used only to prorate this item's own snapshot tax and discount across a partial-quantity return. */
  orderedQuantity: number;
  unitPricePaise: number;
  taxAmountPaise: number;
  /** Coupon discount snapshotted on this line at checkout (0 when no coupon). Week 2 review fix (P0). */
  discountPaise: number;
}

export interface ReturnLineQuantity {
  orderItemId: string;
  quantity: number;
}

/**
 * Pure, dependency-free — the refund amount for an approved return is the
 * returned units' own price, MINUS their prorated share of any coupon
 * discount that was applied to that line at checkout, PLUS their prorated
 * share of that line's snapshot tax, summed across every returned line.
 *
 * The discount subtraction (Week 2 review fix, P0) is what keeps the refund
 * from exceeding what the customer actually paid: `unitPricePaise` is the
 * UNDISCOUNTED per-unit price, so on a coupon order `unitPricePaise * qty`
 * alone over-refunds by exactly the coupon's share of the line. The line's
 * snapshot `taxAmountPaise` was already computed on the post-discount base
 * at checkout, so tax needs no further adjustment here.
 *
 * Deliberately excludes `Order.shippingFeePaise`: nothing in week2 (1).md
 * §10/§12 says a partial (or even full-item) return refunds shipping, and
 * shipping was charged once for the whole shipment regardless of which
 * items end up kept — flagged here as the interpretation, not an oversight.
 */
export function calculateReturnRefundAmount(orderItems: RefundableOrderItem[], lines: ReturnLineQuantity[]): number {
  return lines.reduce((total, line) => {
    const item = orderItems.find((oi) => oi.orderItemId === line.orderItemId);
    if (!item || item.orderedQuantity <= 0) {
      return total; // defensive — should never happen, a caller should have validated eligibility first
    }
    const unitShare = item.unitPricePaise * line.quantity;
    const discountShare = Math.round((item.discountPaise * line.quantity) / item.orderedQuantity);
    const taxShare = Math.round((item.taxAmountPaise * line.quantity) / item.orderedQuantity);
    return total + unitShare - discountShare + taxShare;
  }, 0);
}
