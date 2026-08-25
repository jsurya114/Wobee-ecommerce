import { describe, expect, it } from "vitest";
import { resolveGstRatePercent } from "./resolve-gst-rate";

const slabs = [
  { maxPricePaise: 250000, ratePercent: 5 }, // <= ₹2,500
  { maxPricePaise: null, ratePercent: 18 }, // above ₹2,500
];

describe("resolveGstRatePercent", () => {
  it("applies the lower slab at the boundary price", () => {
    expect(resolveGstRatePercent(slabs, 250000)).toBe(5);
  });

  it("applies the lower slab below the boundary", () => {
    expect(resolveGstRatePercent(slabs, 100000)).toBe(5);
  });

  it("applies the unbounded top slab above the boundary", () => {
    expect(resolveGstRatePercent(slabs, 250001)).toBe(18);
  });

  it("doesn't depend on slab input order", () => {
    const reversed = [...slabs].reverse();
    expect(resolveGstRatePercent(reversed, 100000)).toBe(5);
    expect(resolveGstRatePercent(reversed, 500000)).toBe(18);
  });
});
