/** Narrow port for this module's one dependency on `inventory` — same DIP rationale as cart's own InventoryReaderPort, wired to the exact same getAvailableQuantitiesUseCase (never a new inventory read path, per this task's own instruction). */
export interface InventoryReaderPort {
  getAvailableQuantities(variantIds: string[]): Promise<Map<string, number>>;
  /** 2026-09-30 — every product with at least one active, in-stock variant (products' FindInStockProductIdsUseCase — the storefront's own "sold out" rule). */
  findInStockProductIds(): Promise<Set<string>>;
}
