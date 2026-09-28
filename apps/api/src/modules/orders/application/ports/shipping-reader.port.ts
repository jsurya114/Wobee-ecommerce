export interface ShippingEvaluation {
  meetsMinimum: boolean;
  isFreeDelivery: boolean;
  shippingFeePaise: number;
  gramsToMinimum: number;
}

/** Narrow port for this module's dependency on `shipping` — the checkout-blocking half of ADR-021 (cart carries the display/progress half). */
export interface ShippingReaderPort {
  /** `itemsSubtotalPaise` — the cart's offer-adjusted, PRE-coupon items subtotal (free delivery by price, admin settings 2026-09-28). */
  evaluate(totalWeightGrams: number, itemsSubtotalPaise: number): Promise<ShippingEvaluation>;
}
