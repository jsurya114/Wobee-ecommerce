import type { InventoryRepositoryPort } from "../ports/inventory-repository.port";

/** Exported from inventory.module.ts for cross-module use — payments' failed-payment flow calls this inside its own transaction. */
export class ReleaseReservationUseCase {
  constructor(private readonly inventoryRepository: InventoryRepositoryPort) {}

  execute(items: { variantId: string; quantity: number }[], tx: unknown): Promise<void> {
    return this.inventoryRepository.releaseReservation(items, tx);
  }
}
