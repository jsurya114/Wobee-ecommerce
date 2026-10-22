/** Narrow port onto `settings` (admin settings, 2026-09-28) — the store-wide rules checkout applies. */
export interface CheckoutRules {
  /** Minimum total item count (sum of quantities). */
  minCartQuantity: number;
  /** When true, a COD order with a delivery fee must prepay that fee online before it can be confirmed. */
  codShippingUpfront: boolean;
}

export interface CheckoutRulesReaderPort {
  getRules(): Promise<CheckoutRules>;
}
