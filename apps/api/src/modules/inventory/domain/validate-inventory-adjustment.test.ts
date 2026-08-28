import { describe, expect, it } from "vitest";
import { isLowStock, isOutOfStock, LOW_STOCK_THRESHOLD, validateInventoryAdjustment } from "./validate-inventory-adjustment";

describe("validateInventoryAdjustment", () => {
  it("accepts a positive restock", () => {
    const result = validateInventoryAdjustment({ quantityAvailable: 10, quantityReserved: 2 }, 5);
    expect(result.ok).toBe(true);
    expect(result.newQuantityAvailable).toBe(15);
  });

  it("accepts a negative adjustment that stays above reserved", () => {
    const result = validateInventoryAdjustment({ quantityAvailable: 10, quantityReserved: 2 }, -5);
    expect(result.ok).toBe(true);
    expect(result.newQuantityAvailable).toBe(5);
  });

  it("rejects an adjustment that would make available stock negative", () => {
    const result = validateInventoryAdjustment({ quantityAvailable: 10, quantityReserved: 0 }, -11);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/negative/i);
  });

  it("rejects an adjustment that would drop available below reserved", () => {
    const result = validateInventoryAdjustment({ quantityAvailable: 10, quantityReserved: 8 }, -5);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/reserved/i);
  });

  it("accepts exactly down to the reserved amount", () => {
    const result = validateInventoryAdjustment({ quantityAvailable: 10, quantityReserved: 8 }, -2);
    expect(result.ok).toBe(true);
    expect(result.newQuantityAvailable).toBe(8);
  });

  it("accepts exactly down to zero when nothing is reserved", () => {
    const result = validateInventoryAdjustment({ quantityAvailable: 10, quantityReserved: 0 }, -10);
    expect(result.ok).toBe(true);
    expect(result.newQuantityAvailable).toBe(0);
  });
});

describe("isLowStock", () => {
  it(`flags sellable quantity at or under the ${LOW_STOCK_THRESHOLD}-unit threshold`, () => {
    expect(isLowStock(LOW_STOCK_THRESHOLD, 0)).toBe(true);
    expect(isLowStock(LOW_STOCK_THRESHOLD + 1, 0)).toBe(false);
  });

  it("is never true for zero or negative sellable stock (that's out-of-stock, not low-stock)", () => {
    expect(isLowStock(0, 0)).toBe(false);
    expect(isLowStock(3, 5)).toBe(false);
  });

  it("accounts for reserved quantity, not just available", () => {
    expect(isLowStock(10, 6)).toBe(true); // sellable = 4
  });
});

describe("isOutOfStock", () => {
  it("is true when sellable quantity is zero or negative", () => {
    expect(isOutOfStock(0, 0)).toBe(true);
    expect(isOutOfStock(5, 5)).toBe(true);
    expect(isOutOfStock(5, 6)).toBe(true);
  });

  it("is false when sellable quantity is positive", () => {
    expect(isOutOfStock(5, 4)).toBe(false);
  });
});
