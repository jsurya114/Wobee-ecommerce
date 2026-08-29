import type { InventoryRepositoryPort, ReservationOutcome } from "../ports/inventory-repository.port";

/**
 * ADR-015's `SELECT ... FOR UPDATE` reservation, exported from
 * inventory.module.ts for cross-module use — orders' checkout use-case is
 * the only caller this week, invoked inside its own Unit-of-Work transaction
 * so an insufficient-stock failure rolls back cleanly (see
 * InventoryRepositoryPort.reserveForCheckout's own doc comment on `tx`).
 */
export class ReserveInventoryForCheckoutUseCase {
  constructor(private readonly inventoryRepository: InventoryRepositoryPort) {}

  execute(items: { variantId: string; quantity: number }[], tx: unknown): Promise<ReservationOutcome> {
    return this.inventoryRepository.reserveForCheckout(items, tx);
  }
}
