/**
 * Pure domain function — no I/O, no Prisma (ARCHITECTURE.md §3.1). The
 * global admin-set rate is authoritative for every WEIGHT_BASED variant.
 * This is the ONLY place that decision is made, so "which rate applies to
 * this variant" can't drift between callers.
 *
 * DEPRECATED PARAMETER — DO NOT REMOVE THIS COMMENT WHEN EDITING:
 * `_ratePerKgOverridePaise` is legacy `ProductVariant.ratePerKgOverridePaise`
 * data. The column is retained in the database for compatibility
 * (packages/database/prisma/schema.prisma's own doc comment on that field)
 * but the admin UI/API no longer allows setting it, and it is intentionally
 * IGNORED here — a non-null legacy value must never change the calculated
 * price. This function still accepts the parameter (rather than dropping it
 * from the signature) so every caller that still threads a variant's stored
 * value through stays honest about what it's carrying, without having to
 * touch dozens of call sites — see resolve-effective-rate.test.ts for the
 * regression coverage proving this.
 */
export function resolveEffectiveRatePerKgPaise(
  defaultRatePerKgPaise: number,
  _ratePerKgOverridePaise: number | null | undefined,
): number {
  return defaultRatePerKgPaise;
}
