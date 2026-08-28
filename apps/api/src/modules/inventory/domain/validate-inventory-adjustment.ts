/** DECISIONS_PENDING.md #6 — no confirmed low-stock policy exists yet; 5 units is an arbitrary round-number default, not a stated business rule. */
export const LOW_STOCK_THRESHOLD = 5;

export interface CurrentInventoryLevel {
  quantityAvailable: number;
  quantityReserved: number;
}

export interface InventoryAdjustmentValidation {
  ok: boolean;
  reason?: string;
  newQuantityAvailable: number;
}

/**
 * Pure, dependency-free (week2 (1).md §15's own rules: manual adjustments
 * must be validated, and inventory must never become negative). `delta` is
 * signed — positive restocks, negative deducts (e.g. correcting a damaged-
 * stock miscount). Two guards, not one: `quantityAvailable` itself can
 * never go negative, and it can never drop below `quantityReserved` either
 * — every other inventory operation in this codebase (reserveForCheckout,
 * etc.) already assumes `quantityAvailable - quantityReserved` is the real
 * sellable pool and is never negative; letting a manual adjustment violate
 * that here would silently break that invariant everywhere else.
 */
export function validateInventoryAdjustment(current: CurrentInventoryLevel, delta: number): InventoryAdjustmentValidation {
  const newQuantityAvailable = current.quantityAvailable + delta;

  if (newQuantityAvailable < 0) {
    return { ok: false, reason: "This adjustment would make available stock negative", newQuantityAvailable };
  }
  if (newQuantityAvailable < current.quantityReserved) {
    return {
      ok: false,
      reason: "This adjustment would drop available stock below what's already reserved for pending orders",
      newQuantityAvailable,
    };
  }

  return { ok: true, newQuantityAvailable };
}

export function isLowStock(quantityAvailable: number, quantityReserved: number): boolean {
  const sellable = quantityAvailable - quantityReserved;
  return sellable > 0 && sellable <= LOW_STOCK_THRESHOLD;
}

export function isOutOfStock(quantityAvailable: number, quantityReserved: number): boolean {
  return quantityAvailable - quantityReserved <= 0;
}
