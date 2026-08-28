/** Narrow write port onto `inventory` (Week 2 Day 7, week2 (1).md §14) — a brand-new variant gets its inventory row through this, never a direct Prisma write here (ADR-010). */
export interface InventoryInitializerPort {
  initializeForVariant(variantId: string, initialQuantity: number): Promise<void>;
}
