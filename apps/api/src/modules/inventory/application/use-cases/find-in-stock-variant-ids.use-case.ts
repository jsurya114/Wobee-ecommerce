import type { InventoryRepositoryPort } from "../ports/inventory-repository.port";

/**
 * Week 2 Day 1 — exported from inventory.module.ts for cross-module use
 * (products' catalogue "in stock only" filter). Live read, same rationale
 * as GetAvailableQuantitiesUseCase.
 */
export class FindInStockVariantIdsUseCase {
  constructor(private readonly inventoryRepository: InventoryRepositoryPort) {}

  execute(): Promise<string[]> {
    return this.inventoryRepository.findInStockVariantIds();
  }
}
