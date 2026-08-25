import type { GstSlabValues } from "../../domain/resolve-gst-rate";

/**
 * application depends on this interface, not on Prisma directly — the
 * infrastructure layer implements it (ARCHITECTURE.md §3.1).
 */
export interface PricingRepositoryPort {
  /** Latest PricingSetting row with effectiveFrom <= now(). Throws if none exists — a launched store always has one (seeded). */
  findCurrentDefaultRatePerKgPaise(): Promise<number>;
  /** All GstSlab rows (ADR-023) — throws if none exist, same "seeded, always present" contract as the rate above. */
  findActiveGstSlabs(): Promise<GstSlabValues[]>;
}
