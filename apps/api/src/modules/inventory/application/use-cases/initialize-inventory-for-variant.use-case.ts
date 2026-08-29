import type { InventoryRepositoryPort } from "../ports/inventory-repository.port";

/** Exported for `products`' own InventoryInitializerPort adapter (Week 2 Day 7) — a brand-new admin-created variant starts with zero (or an admin-provided initial count) sellable stock, never with no inventory row at all (every other inventory operation in this codebase assumes exactly one row per variant exists). */
export class InitializeInventoryForVariantUseCase {
  constructor(private readonly inventoryRepository: InventoryRepositoryPort) {}

  execute(variantId: string, initialQuantity: number): Promise<void> {
    return this.inventoryRepository.initializeForVariant(variantId, initialQuantity);
  }
}
