export interface RefundableOrderItem {
  orderItemId: string;
  /** The full ordered quantity on this OrderItem — not the returned quantity — used only to prorate this item's own snapshot tax across a partial-quantity return. */
  orderedQuantity: number;
  unitPricePaise: number;
  taxAmountPaise: number;
}

export interface ReturnLineQuantity {
  orderItemId: string;
  quantity: number;
}

/**
 * Pure, dependency-free — the refund amount for an approved return is the
 * returned units' own price plus their prorated share of that line's
 * snapshot tax, summed across every returned line. Deliberately excludes
 * `Order.shippingFeePaise`: nothing in week2 (1).md §10/§12 says a partial
 * (or even full-item) return refunds shipping, and shipping was charged
 * once for the whole shipment regardless of which items end up kept —
 * flagged here as the interpretation, not an oversight.
 */
export function calculateReturnRefundAmount(orderItems: RefundableOrderItem[], lines: ReturnLineQuantity[]): number {
  return lines.reduce((total, line) => {
    const item = orderItems.find((oi) => oi.orderItemId === line.orderItemId);
    if (!item || item.orderedQuantity <= 0) {
      return total; // defensive — should never happen, a caller should have validated eligibility first
    }
    const unitShare = item.unitPricePaise * line.quantity;
    const taxShare = Math.round((item.taxAmountPaise * line.quantity) / item.orderedQuantity);
    return total + unitShare + taxShare;
  }, 0);
}
