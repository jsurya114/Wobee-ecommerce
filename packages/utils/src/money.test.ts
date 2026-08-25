import { describe, expect, it } from "vitest";
import { applyPercentage, formatPaiseAsInr, paiseToRupees, rupeesToPaise } from "./money";

describe("rupeesToPaise / paiseToRupees", () => {
  it("round-trips whole rupees", () => {
    expect(rupeesToPaise(1499)).toBe(149900);
    expect(paiseToRupees(149900)).toBe(1499);
  });

  it("handles paise-precision fractional rupees", () => {
    expect(rupeesToPaise(19.99)).toBe(1999);
  });

  it("rejects non-integer paise", () => {
    expect(() => paiseToRupees(19.5)).toThrow();
  });
});

describe("applyPercentage", () => {
  it("computes GST-style percentage on paise, rounding to nearest paisa", () => {
    // 5% of ₹499.00 (49900 paise) = 2495 paise
    expect(applyPercentage(49900, 5)).toBe(2495);
  });

  it("rejects negative percentage", () => {
    expect(() => applyPercentage(1000, -1)).toThrow();
  });
});

describe("formatPaiseAsInr", () => {
  it("formats paise as an INR string", () => {
    expect(formatPaiseAsInr(149900)).toBe("₹1,499.00");
  });
});
