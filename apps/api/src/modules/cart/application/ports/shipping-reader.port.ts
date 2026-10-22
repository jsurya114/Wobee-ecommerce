export interface ShippingProgress {
  meetsMinimum: boolean;
  isFreeDelivery: boolean;
  shippingFeePaise: number;
  gramsToMinimum: number;
  gramsToFreeDelivery: number;
  /** Admin settings (2026-09-28) — how much more items subtotal unlocks free delivery by price (0 when disabled or already free). */
  paiseToFreeDelivery: number;
  /** 0 = free delivery by price is disabled. */
  freeDeliveryMinSubtotalPaise: number;
}

/** Narrow port for this module's one dependency on `shipping` — same DIP rationale as variant-catalog.port.ts. */
export interface ShippingReaderPort {
  /** `itemsSubtotalPaise` — offer-adjusted, pre-coupon (omit for an empty cart). */
  evaluate(totalWeightGrams: number, itemsSubtotalPaise?: number): Promise<ShippingProgress>;
}
