/** Narrow port onto `pricing` (2026-09-29) — the current global ₹/kg rate, already public on every weight-priced product page. Lets the admin variant form preview a weight-based price without MANAGE_SETTINGS. */
export interface PricingRateReaderPort {
  getCurrentRatePerKgPaise(): Promise<number>;
}
