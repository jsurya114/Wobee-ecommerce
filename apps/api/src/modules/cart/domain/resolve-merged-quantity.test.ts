import { describe, expect, it } from "vitest";
import { resolveMergedQuantity } from "./resolve-merged-quantity";

describe("resolveMergedQuantity", () => {
  it("takes the higher quantity on conflict (ADR-011) — never sums", () => {
    expect(resolveMergedQuantity(2, 5)).toBe(5);
    expect(resolveMergedQuantity(5, 2)).toBe(5);
  });

  it("is stable when both sides already match", () => {
    expect(resolveMergedQuantity(3, 3)).toBe(3);
  });
});
