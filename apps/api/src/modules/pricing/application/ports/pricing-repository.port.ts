import type { GstSlabValues } from "../../domain/resolve-gst-rate";

/**
 * application depends on this interface, not on Prisma directly — the
 * infrastructure layer implements it (ARCHITECTURE.md §3.1).
 */
export interface PricingRepositoryPort {
  /** Latest PricingSetting row with effectiveFrom <= now(). Throws if none exists — a launched store always has one (seeded). */
  findCurrentDefaultRatePerKgPaise(): Promise<number>;
  /**
   * Admin-facing "current setting" read — same latest-row lookup as
   * findCurrentDefaultRatePerKgPaise but also returns when it took effect,
   * for the Settings UI's "effective since" display.
   */
  findCurrentPricingSetting(): Promise<{ ratePerKgPaise: number; effectiveFrom: Date }>;
  /**
   * PricingSetting is append-only (this table is always the source of
   * truth, especially at checkout — see the model's own doc comment):
   * changing the rate INSERTS a new row effective now(), it never updates
   * or deletes an existing one. Every order already snapshots the rate it
   * used onto OrderItem at purchase time (CreateOrderUseCase), so inserting
   * a new current rate here can never retroactively change a past order's
   * price — there is nothing to snapshot-migrate.
   */
  insertPricingSetting(ratePerKgPaise: number): Promise<{ ratePerKgPaise: number; effectiveFrom: Date }>;
  /** All GstSlab rows (ADR-023) — throws if none exist, same "seeded, always present" contract as the rate above. */
  findActiveGstSlabs(): Promise<GstSlabValues[]>;
}
