import type { InventoryRepositoryPort } from "../ports/inventory-repository.port";

/**
 * Read-only stock lookup — exported from inventory.module.ts for
 * cross-module use (products' in-stock display, cart's add/merge
 * revalidation). The row-locking reservation use-case (ADR-015,
 * `SELECT ... FOR UPDATE` inside the checkout transaction) lands Week 1
 * Day 4 alongside checkout — this repository is the same one that use-case
 * will extend, not a throwaway.
 */
export class GetAvailableQuantitiesUseCase {
  constructor(private readonly inventoryRepository: InventoryRepositoryPort) {}

  async execute(variantIds: string[]): Promise<Map<string, number>> {
    if (variantIds.length === 0) return new Map();
    return this.inventoryRepository.findAvailableQuantitiesByVariantIds(variantIds);
  }
}
