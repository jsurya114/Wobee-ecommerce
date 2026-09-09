import { LOW_STOCK_THRESHOLD } from "@woobe/types";
import type { InventoryStatus } from "@woobe/types";

/**
 * DECISIONS_PENDING.md #6 — no confirmed low-stock policy exists yet; 10
 * units is an arbitrary round-number default, not a stated business rule.
 * Re-exported here so every existing importer in this module (the
 * repository, this file's own tests) keeps working unchanged — but
 * `packages/types` is the single source of truth now; apps/admin imports
 * it from there directly instead of keeping its own duplicate copy (the two
 * copies had drifted into inconsistent off-by-one comparisons — see
 * `isLowStock` below).
 */
export { LOW_STOCK_THRESHOLD };

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

/**
 * Spec: sellable >= LOW_STOCK_THRESHOLD is IN_STOCK, not LOW_STOCK — the
 * threshold value itself is the boundary that's still "enough" stock. Fixed
 * from a `<=` off-by-one that classified exactly-at-threshold as LOW_STOCK;
 * boundary is covered by this file's own test (threshold-1 -> low stock,
 * threshold -> in stock).
 */
export function isLowStock(quantityAvailable: number, quantityReserved: number): boolean {
  const sellable = quantityAvailable - quantityReserved;
  return sellable > 0 && sellable < LOW_STOCK_THRESHOLD;
}

/**
 * Left as `<= 0` (not tightened to `=== 0`) deliberately, as a defensive
 * guard rather than a strict boundary check: `validateInventoryAdjustment`
 * above guarantees quantityAvailable can never drop below quantityReserved
 * through a manual adjustment, and reserveForCheckout/finalize/release in
 * InventoryRepository never let quantityReserved exceed quantityAvailable
 * either — so sellable should never actually go negative in this
 * codebase today. But nothing about that invariant is enforced at this
 * function's own boundary, and a future write path could violate it; `<= 0`
 * costs nothing and fails safe (still correctly OUT_OF_STOCK) if it ever
 * does, where `=== 0` would silently misclassify a negative as neither
 * low nor out of stock.
 */
export function isOutOfStock(quantityAvailable: number, quantityReserved: number): boolean {
  return quantityAvailable - quantityReserved <= 0;
}

/** Single computed classification backing AdminInventoryRow.status — see this function's own callers for why the frontend never re-derives this from raw numbers. */
export function getInventoryStatus(quantityAvailable: number, quantityReserved: number): InventoryStatus {
  if (isOutOfStock(quantityAvailable, quantityReserved)) return "OUT_OF_STOCK";
  if (isLowStock(quantityAvailable, quantityReserved)) return "LOW_STOCK";
  return "IN_STOCK";
}
