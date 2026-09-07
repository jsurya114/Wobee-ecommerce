import type { OrderStatus } from "@woobe/types";
import type { OrderRepositoryPort, VariantSaleQuantity } from "../ports/order-repository.port";

/**
 * Exported for cross-module use (Week 2 Day 8 Part 2, week2 (1).md §12) —
 * `home`'s GetHomePageUseCase calls this instead of importing Prisma or
 * OrderItem itself (ADR-010: OrderItem belongs to `orders`). Deliberately
 * thin — the repository already does the real work (a single grouped
 * aggregate query, no N+1); this exists only so `home` depends on a
 * use-case, not the repository interface directly, the same boundary every
 * other cross-module export in this module already draws.
 *
 * `statuses` (merchandising logic corrections, 2026-09-06) passes straight
 * through to the repository — see `findBestSellingVariantQuantities`'s own
 * doc comment. Omitted by the admin dashboard's caller (unchanged
 * behavior); `home` passes `["DELIVERED"]` for its "Loved by Customers" rail.
 */
export class GetBestSellingVariantQuantitiesUseCase {
  constructor(private readonly orderRepository: OrderRepositoryPort) {}

  execute(limit: number, statuses?: OrderStatus[]): Promise<VariantSaleQuantity[]> {
    return this.orderRepository.findBestSellingVariantQuantities(limit, statuses);
  }
}
