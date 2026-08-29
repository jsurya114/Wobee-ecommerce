export interface ShippingEvaluation {
  meetsMinimum: boolean;
  isFreeDelivery: boolean;
  shippingFeePaise: number;
  gramsToMinimum: number;
}

/** Narrow port for this module's dependency on `shipping` — the checkout-blocking half of ADR-021 (cart carries the display/progress half). */
export interface ShippingReaderPort {
  evaluate(totalWeightGrams: number): Promise<ShippingEvaluation>;
}
