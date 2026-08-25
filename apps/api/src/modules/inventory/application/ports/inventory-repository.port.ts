export interface InsufficientStockLine {
  variantId: string;
  requestedQuantity: number;
  availableQuantity: number;
}

export interface ReservationOutcome {
  success: boolean;
  /** Populated only when success is false — every line that couldn't be fully reserved, not just the first. */
  insufficient: InsufficientStockLine[];
}

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

  /**
   * ADR-015: `SELECT ... FOR UPDATE` on every requested variant's inventory
   * row(s), inside the caller-supplied transaction, before deciding whether
   * to reserve. `tx` is an opaque Unit-of-Work handle (see
   * orders/application/ports/transaction.port.ts) — this repository is the
   * only place that ever casts it back to a real Prisma transaction client,
   * same as it's the only place that imports @woobe/database at all.
   * All-or-nothing: if ANY line can't be fully covered, nothing is reserved
   * (the caller is expected to roll back the whole transaction on failure).
   */
  reserveForCheckout(items: { variantId: string; quantity: number }[], tx: unknown): Promise<ReservationOutcome>;
}
