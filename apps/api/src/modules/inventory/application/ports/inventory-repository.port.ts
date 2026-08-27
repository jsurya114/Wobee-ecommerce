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
   * Week 2 Day 1: every variant id, catalogue-wide, with
   * quantityAvailable - quantityReserved > 0 right now, summed across
   * warehouse rows same as findAvailableQuantitiesByVariantIds. Backs the
   * catalogue listing's "in stock only" filter (products.module.ts wires
   * this through InventoryReaderPort) — deliberately a live read, not a
   * cached flag (DEVELOPMENT_RULES.md #1).
   */
  findInStockVariantIds(): Promise<string[]>;

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

  /**
   * ADR-015's other half of the reservation lifecycle, added Week 1 Day 5
   * alongside payment confirmation: a CONFIRMED order's reservation becomes
   * a real deduction — both `quantityReserved` and `quantityAvailable` drop
   * by the ordered amount. Row-locks first, same as reserveForCheckout, so
   * this can't race a concurrent reservation attempt on the same variant.
   */
  finalizeReservation(items: { variantId: string; quantity: number }[], tx: unknown): Promise<void>;

  /**
   * The failure counterpart: a PAYMENT_FAILED order's held stock is
   * released back to the available pool — only `quantityReserved` drops,
   * `quantityAvailable` is untouched (nothing was ever actually sold).
   */
  releaseReservation(items: { variantId: string; quantity: number }[], tx: unknown): Promise<void>;

  /**
   * Week 2 Day 0 remediation (post-Week-1-review): the OTHER failure
   * counterpart, for a sale that was already finalized. A `CONFIRMED`/
   * `PROCESSING` order being cancelled already went through
   * `finalizeReservation` — `quantityReserved` for its items is already 0,
   * `quantityAvailable` already dropped. Reusing `releaseReservation` here
   * (bounded by `quantityReserved`) was the Week 1 bug: it found nothing to
   * release and silently no-opped, permanently shrinking the sellable pool.
   * This restores the sold stock the opposite way: `quantityAvailable`
   * increments by the cancelled quantity, `quantityReserved` is untouched
   * (there was never a hold to give back — the sale is simply being undone).
   * Row-locks first, same as the other three methods.
   */
  restockFinalizedSale(items: { variantId: string; quantity: number }[], tx: unknown): Promise<void>;
}
