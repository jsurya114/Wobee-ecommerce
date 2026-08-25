/**
 * application depends on this interface, not on Prisma directly — the
 * infrastructure layer implements it (ARCHITECTURE.md §3.1).
 */
export interface InventoryRepositoryPort {
  /**
   * Sums quantityAvailable - quantityReserved across every warehouse row
   * for each variant (single warehouse at launch per ADR-015, but written
   * to stay correct once a second warehouse row exists). Missing variantIds
   * are simply absent from the returned map, not zeroed — callers decide
   * how to treat "no inventory row at all" vs. "zero stock".
   */
  findAvailableQuantitiesByVariantIds(variantIds: string[]): Promise<Map<string, number>>;
}
