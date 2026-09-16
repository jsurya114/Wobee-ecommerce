import { describe, expect, it } from "vitest";
import { calculateOfferDiscount } from "./calculate-offer-discount";

describe("calculateOfferDiscount", () => {
  it("computes a percentage discount, rounded down", () => {
    // 20% of 9999 = 1999.8 -> floors to 1999
    expect(calculateOfferDiscount({ discountType: "PERCENTAGE", discountValue: 20 }, 9999)).toBe(1999);
  });

  it("computes a fixed-amount discount", () => {
    expect(calculateOfferDiscount({ discountType: "FIXED_AMOUNT", discountValue: 300_00 }, 1000_00)).toBe(300_00);
  });

  it("clamps a fixed-amount discount larger than the base price to the base price itself — never negative", () => {
    expect(calculateOfferDiscount({ discountType: "FIXED_AMOUNT", discountValue: 10_000 }, 3000)).toBe(3000);
  });

  it("clamps a 100% percentage discount to the base price exactly", () => {
    expect(calculateOfferDiscount({ discountType: "PERCENTAGE", discountValue: 100 }, 5000)).toBe(5000);
  });

  it("returns zero for a zero base price", () => {
    expect(calculateOfferDiscount({ discountType: "PERCENTAGE", discountValue: 50 }, 0)).toBe(0);
  });
});
