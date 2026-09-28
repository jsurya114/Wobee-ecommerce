/** Narrow port onto `settings` (2026-09-28) — whether customers may request NEW returns right now. */
export interface ReturnsPolicyPort {
  isEnabled(): Promise<boolean>;
}
