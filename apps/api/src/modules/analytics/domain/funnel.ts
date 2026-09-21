import type { BusinessFunnel, FunnelStep } from "@woobe/types";
import { pct } from "./rates";

export interface FunnelCounts {
  sessions: number;
  productViews: number;
  addToCart: number;
  checkout: number;
  paidOrders: number;
}

const STEP_DEFS: { key: FunnelStep["key"]; label: string; pick: (c: FunnelCounts) => number }[] = [
  { key: "visitors", label: "Visitors (sessions)", pick: (c) => c.sessions },
  { key: "productViews", label: "Product views", pick: (c) => c.productViews },
  { key: "addToCart", label: "Added to cart", pick: (c) => c.addToCart },
  { key: "checkout", label: "Started checkout", pick: (c) => c.checkout },
  { key: "paidOrders", label: "Orders placed", pick: (c) => c.paidOrders },
];

/**
 * Turns the SQL's sequential session counts into presentation-ready steps.
 * The SQL already guarantees monotonic counts (each step requires every prior
 * one); `Math.min` with the previous step is a belt-and-braces guard so a
 * future query change can never render a negative drop-off.
 */
export function buildFunnel(counts: FunnelCounts): BusinessFunnel {
  const steps: FunnelStep[] = [];
  let previous: number | null = null;
  for (const def of STEP_DEFS) {
    const raw: number = Math.max(0, def.pick(counts));
    const count: number = previous === null ? raw : Math.min(raw, previous);
    const stepConversionPct = previous === null ? null : pct(count, previous);
    steps.push({
      key: def.key,
      label: def.label,
      count,
      pctOfVisitors: pct(count, counts.sessions),
      stepConversionPct,
      dropOffPct: stepConversionPct === null ? null : Math.round((100 - stepConversionPct) * 10) / 10,
    });
    previous = count;
  }
  return {
    steps,
    overallConversionPct: pct(steps[4]!.count, steps[0]!.count),
    checkoutCompletionPct: pct(steps[4]!.count, steps[3]!.count),
    hasData: counts.sessions > 0,
  };
}
