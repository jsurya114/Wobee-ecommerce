import { describe, expect, it } from "vitest";
import { validateOfferInput, type OfferInputForValidation } from "./validate-offer-input";

function input(overrides: Partial<OfferInputForValidation> = {}): OfferInputForValidation {
  return {
    discountType: "PERCENTAGE",
    discountValue: 20,
    scope: "ALL_PRODUCTS",
    categoryId: null,
    productIds: [],
    startsAt: new Date("2026-01-01"),
    endsAt: new Date("2026-02-01"),
    ...overrides,
  };
}

describe("validateOfferInput", () => {
  it("accepts a valid storewide percentage offer", () => {
    expect(validateOfferInput(input())).toBeNull();
  });

  it("rejects a percentage over 100", () => {
    expect(validateOfferInput(input({ discountValue: 150 }))).toMatch(/between 1 and 100/);
  });

  it("rejects a zero/negative percentage", () => {
    expect(validateOfferInput(input({ discountValue: 0 }))).toMatch(/between 1 and 100/);
  });

  it("rejects a zero/negative fixed-amount value", () => {
    expect(validateOfferInput(input({ discountType: "FIXED_AMOUNT", discountValue: 0 }))).toMatch(/positive amount/);
  });

  it("accepts a positive fixed-amount value of any size (bounded elsewhere by calculateOfferDiscount's own clamp)", () => {
    expect(validateOfferInput(input({ discountType: "FIXED_AMOUNT", discountValue: 999_00 }))).toBeNull();
  });

  it("rejects endsAt at or before startsAt", () => {
    expect(validateOfferInput(input({ startsAt: new Date("2026-02-01"), endsAt: new Date("2026-01-01") }))).toMatch(/after the start date/);
    expect(validateOfferInput(input({ startsAt: new Date("2026-01-01"), endsAt: new Date("2026-01-01") }))).toMatch(/after the start date/);
  });

  it("rejects CATEGORY scope with no categoryId", () => {
    expect(validateOfferInput(input({ scope: "CATEGORY", categoryId: null }))).toMatch(/Choose a category/);
  });

  it("rejects a categoryId set on a non-CATEGORY scope", () => {
    expect(validateOfferInput(input({ scope: "ALL_PRODUCTS", categoryId: "some-id" }))).toMatch(/only be set for a category-scoped/);
  });

  it("accepts CATEGORY scope with a categoryId", () => {
    expect(validateOfferInput(input({ scope: "CATEGORY", categoryId: "category-1" }))).toBeNull();
  });

  it("rejects PRODUCTS scope with an empty product list", () => {
    expect(validateOfferInput(input({ scope: "PRODUCTS", productIds: [] }))).toMatch(/at least one product/);
  });

  it("rejects productIds set on a non-PRODUCTS scope", () => {
    expect(validateOfferInput(input({ scope: "ALL_PRODUCTS", productIds: ["product-1"] }))).toMatch(/only be set for a product-scoped/);
  });

  it("accepts PRODUCTS scope with at least one product", () => {
    expect(validateOfferInput(input({ scope: "PRODUCTS", productIds: ["product-1"] }))).toBeNull();
  });
});
