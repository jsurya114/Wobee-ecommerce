import { describe, expect, it } from "vitest";
import { generateOrderNumber } from "./order-number";

describe("generateOrderNumber", () => {
  it("formats as WOOBE-YYYYMMDD-<uppercased suffix>", () => {
    const now = new Date(Date.UTC(2026, 7, 25, 10, 30));
    expect(generateOrderNumber(now, "a1b2c3")).toBe("WOOBE-20260825-A1B2C3");
  });

  it("pads single-digit months and days", () => {
    const now = new Date(Date.UTC(2026, 0, 5));
    expect(generateOrderNumber(now, "ff00ff")).toBe("WOOBE-20260105-FF00FF");
  });
});
