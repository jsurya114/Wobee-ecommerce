import { describe, expect, it } from "vitest";
import { buildFunnel } from "./funnel";

describe("buildFunnel", () => {
  it("computes % of visitors, step conversion and drop-off", () => {
    const f = buildFunnel({ sessions: 1000, productViews: 600, addToCart: 120, checkout: 60, paidOrders: 30 });
    expect(f.hasData).toBe(true);
    expect(f.steps.map((s) => s.count)).toEqual([1000, 600, 120, 60, 30]);
    expect(f.steps.map((s) => s.pctOfVisitors)).toEqual([100, 60, 12, 6, 3]);
    expect(f.steps[0]!.stepConversionPct).toBeNull();
    expect(f.steps[0]!.dropOffPct).toBeNull();
    expect(f.steps[1]!.stepConversionPct).toBe(60);
    expect(f.steps[1]!.dropOffPct).toBe(40);
    expect(f.steps[2]!.stepConversionPct).toBe(20);
    expect(f.steps[4]!.stepConversionPct).toBe(50);
    expect(f.overallConversionPct).toBe(3);
    expect(f.checkoutCompletionPct).toBe(50);
  });

  it("handles no traffic without NaN/Infinity and flags hasData=false", () => {
    const f = buildFunnel({ sessions: 0, productViews: 0, addToCart: 0, checkout: 0, paidOrders: 0 });
    expect(f.hasData).toBe(false);
    for (const s of f.steps) {
      expect(s.pctOfVisitors).toBeNull();
      expect(s.stepConversionPct).toBeNull();
      expect(s.dropOffPct).toBeNull();
    }
    expect(f.overallConversionPct).toBeNull();
    expect(f.checkoutCompletionPct).toBeNull();
  });

  it("clamps a non-monotonic input so drop-off is never negative", () => {
    const f = buildFunnel({ sessions: 10, productViews: 5, addToCart: 8, checkout: 2, paidOrders: 3 });
    expect(f.steps.map((s) => s.count)).toEqual([10, 5, 5, 2, 2]);
    for (const s of f.steps.slice(1)) expect(s.dropOffPct!).toBeGreaterThanOrEqual(0);
  });

  it("a zero middle step makes downstream step conversion null, not Infinity", () => {
    const f = buildFunnel({ sessions: 10, productViews: 0, addToCart: 0, checkout: 0, paidOrders: 0 });
    expect(f.steps[2]!.stepConversionPct).toBeNull();
    expect(f.checkoutCompletionPct).toBeNull();
  });
});
