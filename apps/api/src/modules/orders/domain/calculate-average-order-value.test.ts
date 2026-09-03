import { describe, expect, it } from "vitest";
import { calculateAverageOrderValuePaise } from "./calculate-average-order-value";

describe("calculateAverageOrderValuePaise", () => {
  it("divides revenue by order count, rounded to the nearest paise", () => {
    expect(calculateAverageOrderValuePaise(1000, 3)).toBe(333);
  });

  it("returns 0 for zero orders instead of NaN", () => {
    expect(calculateAverageOrderValuePaise(0, 0)).toBe(0);
  });
});
