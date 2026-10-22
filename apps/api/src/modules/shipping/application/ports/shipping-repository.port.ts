import type { ShippingRuleValues } from "../../domain/resolve-shipping";

/**
 * application depends on this interface, not on Prisma directly — the
 * infrastructure layer implements it (ARCHITECTURE.md §3.1).
 */
export interface ShippingRepositoryPort {
  findCurrentRule(): Promise<ShippingRuleValues>;
  /** Admin settings (2026-09-28) — the current rule plus when it took effect. */
  findCurrentRuleWithEffectiveFrom(): Promise<ShippingRuleValues & { effectiveFrom: Date }>;
  /** Append-only: inserts a NEW rule effective now(); never updates or deletes a previous row (same contract as PricingSetting). */
  insertRule(values: ShippingRuleValues): Promise<ShippingRuleValues & { effectiveFrom: Date }>;
}
