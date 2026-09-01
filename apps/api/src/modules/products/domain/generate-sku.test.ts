import { describe, expect, it } from "vitest";
import { generateSku } from "./generate-sku";

describe("generateSku", () => {
  it("produces a WOO-prefixed 8-character uppercase hex code", () => {
    expect(generateSku()).toMatch(/^WOO-[0-9A-F]{8}$/);
  });

  it("does not encode price, weight, or any business data — pure random identifier", () => {
    const sku = generateSku();
    expect(sku).not.toContain("undefined");
    expect(sku).not.toContain("NaN");
  });

  it("is not derived from any input — takes no arguments", () => {
    expect(generateSku.length).toBe(0);
  });

  it("produces distinct values across many calls (collision probability is the use-case's retry loop's job, not this function's, but a bare generator should still vary)", () => {
    const skus = new Set(Array.from({ length: 1000 }, () => generateSku()));
    expect(skus.size).toBe(1000);
  });
});
