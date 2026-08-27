/** Narrow port for this module's one dependency on `inventory` — same DIP rationale as pricing-reader.port.ts. */
export interface InventoryReaderPort {
  getAvailableQuantities(variantIds: string[]): Promise<Map<string, number>>;
  /**
   * Every variant id, catalogue-wide, with live available stock
   * (quantityAvailable - quantityReserved > 0) right now. Backs the listing
   * "in stock only" filter — DEVELOPMENT_RULES.md #1 means that filter has
   * to read live inventory state, not a cached/denormalized flag, so this
   * goes through `inventory`'s own repository rather than products reaching
   * into the Inventory table itself (ADR-010).
   */
  findInStockVariantIds(): Promise<string[]>;
}
