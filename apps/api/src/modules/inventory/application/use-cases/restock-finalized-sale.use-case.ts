import type { InventoryRepositoryPort } from "../ports/inventory-repository.port";

/**
 * Exported from inventory.module.ts for cross-module use — `orders`'
 * `CancelOrderUseCase` calls this (via a narrow port) when cancelling a
 * `CONFIRMED`/`PROCESSING` order, i.e. one whose reservation was already
 * finalized into a real deduction. See `restockFinalizedSale`'s own port
 * doc comment for why this is a distinct operation from
 * `ReleaseReservationUseCase`, not a reuse of it (Week 2 Day 0 remediation).
 */
export class RestockFinalizedSaleUseCase {
  constructor(private readonly inventoryRepository: InventoryRepositoryPort) {}

  execute(items: { variantId: string; quantity: number }[], tx: unknown): Promise<void> {
    return this.inventoryRepository.restockFinalizedSale(items, tx);
  }
}
