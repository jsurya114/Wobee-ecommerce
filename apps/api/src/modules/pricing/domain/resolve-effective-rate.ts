/**
 * Pure domain function — no I/O, no Prisma (ARCHITECTURE.md §3.1). A
 * variant's own ratePerKgOverridePaise wins when set; otherwise the current
 * admin default rate applies. This is the ONLY place that decision is made,
 * so "which rate applies to this variant" can't drift between callers.
 */
export function resolveEffectiveRatePerKgPaise(
  defaultRatePerKgPaise: number,
  ratePerKgOverridePaise: number | null | undefined,
): number {
  return ratePerKgOverridePaise ?? defaultRatePerKgPaise;
}
