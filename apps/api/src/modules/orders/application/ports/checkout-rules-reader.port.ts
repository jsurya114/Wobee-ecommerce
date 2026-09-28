/** Narrow port onto `settings` (admin settings, 2026-09-28) — the store-wide minimum item count checkout enforces. */
export interface CheckoutRulesReaderPort {
  getMinCartQuantity(): Promise<number>;
}
