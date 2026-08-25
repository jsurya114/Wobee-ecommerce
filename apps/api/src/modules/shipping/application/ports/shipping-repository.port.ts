import type { ShippingRuleValues } from "../../domain/resolve-shipping";

/**
 * application depends on this interface, not on Prisma directly — the
 * infrastructure layer implements it (ARCHITECTURE.md §3.1).
 */
export interface ShippingRepositoryPort {
  findCurrentRule(): Promise<ShippingRuleValues>;
}
