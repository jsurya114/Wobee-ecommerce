import { describe, expect, it } from "vitest";
import type { SalesAggregate } from "../application/ports/analytics-repository.port";
import {
  averageOrderValuePaise,
  buildAbandonedCartsView,
  buildCustomersView,
  buildFulfillmentView,
  buildInventoryView,
  buildPaymentsView,
  buildSalesSeries,
  buildSalesView,
  compared,
  computeProfit,
  netSalesPaise,
  netUnits,
  netWeightGrams,
  revenuePerKgPaise,
} from "./dashboard-calculations";
import { resolveDashboardPeriod } from "./dashboard-period";

const ZERO: SalesAggregate = {
  orders: 0, onlineOrders: 0, codOrders: 0, shippingRevenuePaise: 0, taxPaise: 0, units: 0, weightGrams: 0,
  grossSalesPaise: 0, offerDiscountPaise: 0, couponDiscountPaise: 0, itemSalesPaise: 0, cogsPaise: 0, coveredItemNetPaise: 0,
  returnedValuePaise: 0, returnedUnits: 0, returnedWeightGrams: 0, coveredReturnedValuePaise: 0, refundCashPaise: 0, refundedOrders: 0,
};
const sales = (over: Partial<SalesAggregate>): SalesAggregate => ({ ...ZERO, ...over });

describe("net sales", () => {
  it("= item sales - coupon discount - returned value; excludes tax and shipping", () => {
    const a = sales({ itemSalesPaise: 100_000, couponDiscountPaise: 10_000, returnedValuePaise: 15_000, taxPaise: 4_500, shippingRevenuePaise: 5_000 });
    expect(netSalesPaise(a)).toBe(75_000);
  });
  it("is 0 for an empty period", () => expect(netSalesPaise(ZERO)).toBe(0));
});

describe("kg / units / revenue per kg", () => {
  it("kg sold subtracts returned weight and never goes negative", () => {
    expect(netWeightGrams(sales({ weightGrams: 42_800, returnedWeightGrams: 2_800 }))).toBe(40_000);
    expect(netWeightGrams(sales({ weightGrams: 100, returnedWeightGrams: 500 }))).toBe(0);
    expect(netUnits(sales({ units: 10, returnedUnits: 3 }))).toBe(7);
  });
  it("revenue per kg = net sales / net kg, rounded to paise", () => {
    expect(revenuePerKgPaise(sales({ itemSalesPaise: 5_136_000, weightGrams: 42_800 }))).toBe(120_000);
  });
  it("revenue per kg is null (not Infinity/NaN) with zero weight — e.g. only fixed-price zero-weight items or no sales", () => {
    expect(revenuePerKgPaise(ZERO)).toBeNull();
    expect(revenuePerKgPaise(sales({ itemSalesPaise: 9_000, weightGrams: 0 }))).toBeNull();
  });
  it("AOV is net sales / orders and null with no orders", () => {
    expect(averageOrderValuePaise(sales({ orders: 4, itemSalesPaise: 100_003 }))).toBe(25_001);
    expect(averageOrderValuePaise(ZERO)).toBeNull();
  });
});

describe("known-cost profit", () => {
  it("only cost-covered items participate: profit = covered net - COGS", () => {
    const a = sales({ itemSalesPaise: 100_000, coveredItemNetPaise: 60_000, cogsPaise: 35_000 });
    const p = computeProfit(a);
    expect(p.profitPaise).toBe(25_000);
    expect(p.coveredNetSalesPaise).toBe(60_000);
    expect(p.coveragePct).toBe(60);
    expect(p.grossMarginPct).toBe(41.7);
  });

  it("is UNAVAILABLE (null), not zero and not 100% margin, when no item has a cost", () => {
    const a = sales({ itemSalesPaise: 100_000, coveredItemNetPaise: 0, cogsPaise: 0 });
    const p = computeProfit(a);
    expect(p.profitPaise).toBeNull();
    expect(p.coveragePct).toBe(0);
    expect(p.grossMarginPct).toBeNull();
  });

  it("no sales at all -> profit and coverage both null", () => {
    const p = computeProfit(ZERO);
    expect(p.profitPaise).toBeNull();
    expect(p.coveragePct).toBeNull();
  });

  it("refunds of covered items reduce covered net (COGS is not credited back)", () => {
    const a = sales({ itemSalesPaise: 100_000, coveredItemNetPaise: 100_000, cogsPaise: 40_000, returnedValuePaise: 20_000, coveredReturnedValuePaise: 20_000 });
    const p = computeProfit(a);
    expect(p.profitPaise).toBe(40_000); // (100k - 20k) - 40k
    expect(p.coveragePct).toBe(100);
  });

  it("a genuinely loss-making covered period reports a negative profit", () => {
    expect(computeProfit(sales({ itemSalesPaise: 10_000, coveredItemNetPaise: 10_000, cogsPaise: 12_000 })).profitPaise).toBe(-2_000);
  });

  it("coverage is capped at 100", () => {
    const p = computeProfit(sales({ itemSalesPaise: 10_000, coveredItemNetPaise: 10_000, cogsPaise: 1, returnedValuePaise: 0 }));
    expect(p.coveragePct).toBeLessThanOrEqual(100);
  });
});

describe("compared()", () => {
  it("hides the previous value and delta when comparison is off", () => {
    expect(compared(10, 5, false)).toEqual({ value: 10, previous: null, deltaPct: null });
  });
  it("delta is null when previous is zero, even with comparison on", () => {
    expect(compared(10, 0, true)).toEqual({ value: 10, previous: 0, deltaPct: null });
  });
  it("computes a delta when meaningful", () => {
    expect(compared(150, 100, true).deltaPct).toBe(50);
  });
});

describe("sales view", () => {
  it("separates gross, discounts, refunds, net, shipping and tax, and computes rates", () => {
    const a = sales({
      orders: 10, onlineOrders: 7, codOrders: 3, grossSalesPaise: 200_000, offerDiscountPaise: 20_000, couponDiscountPaise: 10_000,
      itemSalesPaise: 180_000, shippingRevenuePaise: 5_000, taxPaise: 9_000, refundCashPaise: 12_000, refundedOrders: 2, returnedValuePaise: 11_000,
      weightGrams: 5_000,
    });
    const v = buildSalesView(a, []);
    expect(v.grossSalesPaise).toBe(200_000);
    expect(v.discountsTotalPaise).toBe(30_000);
    expect(v.discountRatePct).toBe(15);
    expect(v.netSalesPaise).toBe(159_000);
    expect(v.refundsPaise).toBe(12_000);
    expect(v.refundRatePct).toBe(20);
    expect(v.onlineSharePct).toBe(70);
    expect(v.averageKgPerOrder).toBe(0.5);
    expect(v.shippingRevenuePaise).toBe(5_000);
    expect(v.taxCollectedPaise).toBe(9_000);
    expect(v.profit.included.length).toBeGreaterThan(0);
    expect(v.profit.excluded.join(" ")).toMatch(/gateway/i);
  });

  it("an empty period yields nulls for every rate and no NaN anywhere", () => {
    const v = buildSalesView(ZERO, []);
    expect(v.discountRatePct).toBeNull();
    expect(v.refundRatePct).toBeNull();
    expect(v.onlineSharePct).toBeNull();
    expect(v.averageKgPerOrder).toBeNull();
    expect(JSON.stringify(v)).not.toMatch(/NaN|Infinity|undefined/);
  });
});

describe("sales series", () => {
  const period = resolveDashboardPeriod({ range: "7d", compare: "none", now: new Date("2026-09-22T06:00:00Z") });

  it("zero-fills every day so charts have no gaps", () => {
    const s = buildSalesSeries(period.current, "day", [], []);
    expect(s).toHaveLength(7);
    expect(s.every((p) => p.netSalesPaise === 0 && p.orders === 0 && p.knownCostProfitPaise === null && p.sessions === 0)).toBe(true);
  });

  it("merges sales, returns, cost and sessions per day", () => {
    const s = buildSalesSeries(
      period.current,
      "day",
      [{ date: "2026-09-22", orders: 2, itemNetPaise: 50_000, weightGrams: 3_000, coveredItemNetPaise: 30_000, cogsPaise: 10_000, returnedValuePaise: 5_000, returnedWeightGrams: 500, coveredReturnedValuePaise: 5_000 }],
      [{ date: "2026-09-22", sessions: 40 }],
    );
    const day = s.find((p) => p.date === "2026-09-22")!;
    expect(day.netSalesPaise).toBe(45_000);
    expect(day.knownCostProfitPaise).toBe(15_000); // (30k-5k)-10k
    expect(day.weightGrams).toBe(2_500);
    expect(day.orders).toBe(2);
    expect(day.sessions).toBe(40);
  });

  it("weekly bucketing sums days into Monday-start weeks", () => {
    const p90 = resolveDashboardPeriod({ range: "90d", compare: "none", now: new Date("2026-09-22T06:00:00Z") });
    const rows = [
      { date: "2026-09-21", orders: 1, itemNetPaise: 100, weightGrams: 0, coveredItemNetPaise: 0, cogsPaise: 0, returnedValuePaise: 0, returnedWeightGrams: 0, coveredReturnedValuePaise: 0 },
      { date: "2026-09-22", orders: 2, itemNetPaise: 200, weightGrams: 0, coveredItemNetPaise: 0, cogsPaise: 0, returnedValuePaise: 0, returnedWeightGrams: 0, coveredReturnedValuePaise: 0 },
    ];
    const s = buildSalesSeries(p90.current, "week", rows, []);
    const week = s.find((p) => p.date === "2026-09-21")!;
    expect(week.netSalesPaise).toBe(300);
    expect(week.orders).toBe(3);
    expect(s.length).toBeLessThan(20);
  });
});

describe("fulfillment / delivery", () => {
  const agg = { statusCounts: [{ status: "DELIVERED", count: 6 }, { status: "CANCELLED", count: 1 }], shipped: 10, delivered: 6, inTransit: 2, rtoOrders: 2, rtoValuePaise: 30_000 };
  it("RTO rate = RTO / shipped; delivery success = delivered / (delivered + RTO)", () => {
    const v = buildFulfillmentView(agg, { orders: 3, amountPaise: 90_000 }, 4);
    expect(v.rtoRatePct).toBe(20);
    expect(v.deliverySuccessRatePct).toBe(75);
    expect(v.rtoValuePaise).toBe(30_000);
    expect(v.codOutstandingPaise).toBe(90_000);
    expect(v.codOutstandingOrders).toBe(3);
    expect(v.pendingReturns).toBe(4);
  });
  it("lists every status in lifecycle order, zero-filled", () => {
    const v = buildFulfillmentView(agg, { orders: 0, amountPaise: 0 }, 0);
    expect(v.statuses.map((s) => s.status)).toEqual(["PENDING_PAYMENT", "CONFIRMED", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED", "RETURNED_TO_ORIGIN", "CANCELLED", "PAYMENT_FAILED"]);
    expect(v.statuses.find((s) => s.status === "DELIVERED")!.count).toBe(6);
    expect(v.statuses.find((s) => s.status === "PACKED")!.count).toBe(0);
  });
  it("nothing shipped -> rates are null, not NaN", () => {
    const v = buildFulfillmentView({ statusCounts: [], shipped: 0, delivered: 0, inTransit: 0, rtoOrders: 0, rtoValuePaise: 0 }, { orders: 0, amountPaise: 0 }, 0);
    expect(v.rtoRatePct).toBeNull();
    expect(v.deliverySuccessRatePct).toBeNull();
  });
});

describe("payments view", () => {
  it("normalises reasons, counts, sorts and computes the failure rate against successes", () => {
    const v = buildPaymentsView(
      [
        { code: "BAD_REQUEST_ERROR", reason: "insufficient_funds", description: null, amountPaise: 1_000 },
        { code: null, reason: "insufficient_funds", description: null, amountPaise: 2_000 },
        { code: null, reason: "payment_cancelled", description: null, amountPaise: 3_000 },
        { code: null, reason: "totally_new_thing", description: null, amountPaise: 4_000 },
      ],
      6,
    );
    expect(v.failedAttempts).toBe(4);
    expect(v.failedAmountPaise).toBe(10_000);
    expect(v.failureRatePct).toBe(40);
    expect(v.reasons[0]).toMatchObject({ reason: "insufficient_funds", count: 2, pct: 50 });
    expect(v.reasons.map((r) => r.reason).sort()).toEqual(["cancelled", "insufficient_funds", "unknown"]);
  });
  it("no failures: empty reasons and a 0% (not null) rate when there are successes; null with no payments at all", () => {
    expect(buildPaymentsView([], 5).failureRatePct).toBe(0);
    expect(buildPaymentsView([], 0).failureRatePct).toBeNull();
    expect(buildPaymentsView([], 0).reasons).toEqual([]);
  });
});

describe("inventory / customers / abandoned carts", () => {
  it("sell-through = net units sold / (sold + on hand); cost coverage tracks units with a cost", () => {
    const v = buildInventoryView({ units: 90, weightGrams: 1, valueAtCostPaise: 5, retailValuePaise: 9, unitsWithCost: 45, lowStockSkus: 1, outOfStockSkus: 0, byCategory: [], lowStock: [] }, 10);
    expect(v.sellThroughPct).toBe(10);
    expect(v.costCoveragePct).toBe(50);
  });
  it("empty warehouse and no sales -> null sell-through and coverage", () => {
    const v = buildInventoryView({ units: 0, weightGrams: 0, valueAtCostPaise: 0, retailValuePaise: 0, unitsWithCost: 0, lowStockSkus: 0, outOfStockSkus: 0, byCategory: [], lowStock: [] }, 0);
    expect(v.sellThroughPct).toBeNull();
    expect(v.costCoveragePct).toBeNull();
  });
  it("customers: returning = buyers - new; repeat rate over buyers", () => {
    const v = buildCustomersView({ buyers: 10, newBuyers: 7, repeatBuyers: 2, newRegistrations: 12 }, 500);
    expect(v.returningBuyers).toBe(3);
    expect(v.repeatRatePct).toBe(20);
    expect(v.visitors).toBe(500);
    expect(buildCustomersView({ buyers: 0, newBuyers: 0, repeatBuyers: 0, newRegistrations: 0 }, 0).repeatRatePct).toBeNull();
  });
  it("abandonment rate = abandoned / (abandoned + orders placed)", () => {
    expect(buildAbandonedCartsView({ abandoned: 30, estimatedValuePaise: 1, ordersPlaced: 10 }).ratePct).toBe(75);
    expect(buildAbandonedCartsView({ abandoned: 0, estimatedValuePaise: 0, ordersPlaced: 0 }).ratePct).toBeNull();
    expect(buildAbandonedCartsView({ abandoned: 0, estimatedValuePaise: 0, ordersPlaced: 0 }).inactivityHours).toBe(24);
  });
});
