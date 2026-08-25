/**
 * application depends on this interface, not on Prisma directly — the
 * infrastructure layer implements it (ARCHITECTURE.md §3.1).
 */
export interface PricingRepositoryPort {
  /** Latest PricingSetting row with effectiveFrom <= now(). Throws if none exists — a launched store always has one (seeded). */
  findCurrentDefaultRatePerKgPaise(): Promise<number>;
}
