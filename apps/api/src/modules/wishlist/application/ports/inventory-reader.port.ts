/** Narrow port for this module's one dependency on `inventory` — same DIP rationale as cart's own InventoryReaderPort, wired to the exact same getAvailableQuantitiesUseCase (never a new inventory read path, per this task's own instruction). */
export interface InventoryReaderPort {
  getAvailableQuantities(variantIds: string[]): Promise<Map<string, number>>;
}
