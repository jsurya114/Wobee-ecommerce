import { describe, expect, it } from "vitest";
import { deltaPct, pct, ratioRounded } from "./rates";

describe("pct", () => {
  it("rounds to 1 dp", () => expect(pct(1, 3)).toBe(33.3));
  it("is null on a zero / negative / missing denominator — never Infinity or NaN", () => {
    expect(pct(5, 0)).toBeNull();
    expect(pct(5, -1)).toBeNull();
    expect(pct(null, 5)).toBeNull();
    expect(pct(5, undefined)).toBeNull();
    expect(pct(Number.NaN, 5)).toBeNull();
    expect(pct(0, 10)).toBe(0);
  });
});

describe("ratioRounded", () => {
  it("rounds and guards zero", () => {
    expect(ratioRounded(10, 4)).toBe(3);
    expect(ratioRounded(10, 0)).toBeNull();
  });
});

describe("deltaPct", () => {
  it("computes the change vs previous", () => {
    expect(deltaPct(150, 100)).toBe(50);
    expect(deltaPct(50, 100)).toBe(-50);
    expect(deltaPct(100, 100)).toBe(0);
  });
  it("is null when the previous period is zero (delta from zero is undefined, not +Infinity%)", () => {
    expect(deltaPct(100, 0)).toBeNull();
    expect(deltaPct(0, 0)).toBeNull();
  });
  it("is null when either side is missing", () => {
    expect(deltaPct(null, 100)).toBeNull();
    expect(deltaPct(100, null)).toBeNull();
  });
});
