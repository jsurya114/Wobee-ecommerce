/** Narrow port onto `shipping` — the public config echoes the live checkout thresholds so the storefront shows the same numbers checkout enforces. */
export interface ShippingRuleReaderPort {
  getCurrent(): Promise<{ minWeightGramsForCheckout: number; freeDeliveryMinSubtotalPaise: number }>;
}
