import type { InventoryRepositoryPort } from "../ports/inventory-repository.port";

/** Exported from inventory.module.ts for cross-module use — payments' order-confirmation flow calls this inside its own transaction. */
export class FinalizeReservationUseCase {
  constructor(private readonly inventoryRepository: InventoryRepositoryPort) {}

  execute(items: { variantId: string; quantity: number }[], tx: unknown): Promise<void> {
    return this.inventoryRepository.finalizeReservation(items, tx);
  }
}
