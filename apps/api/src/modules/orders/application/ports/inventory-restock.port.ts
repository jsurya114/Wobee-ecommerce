/**
 * Narrow port for this module's dependency on `inventory`'s
 * restock-a-finalized-sale operation (ADR-015, Week 2 Day 0 remediation).
 *
 * Deliberately NOT named/shaped like `payments`' `InventoryFinalizationPort`
 * or the old (Week 1) `InventoryReleasePort` this replaces — those cover
 * "release a hold that was never sold" (PAYMENT_FAILED, before
 * `finalizeReservation` ever ran). Cancelling a `CONFIRMED`/`PROCESSING`
 * order is the opposite case: the sale was already finalized, so the fix is
 * to put the stock back, not to release a reservation that no longer
 * exists. See `inventory`'s `restockFinalizedSale` port doc comment for the
 * full story of why reusing the release operation here was a bug.
 */
export interface InventoryRestockPort {
  restock(items: { variantId: string; quantity: number }[], tx: unknown): Promise<void>;
}
