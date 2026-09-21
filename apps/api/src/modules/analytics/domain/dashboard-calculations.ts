import type {
  BusinessAbandonedCarts,
  BusinessCustomers,
  BusinessFulfillment,
  BusinessInventory,
  BusinessMerchandising,
  BusinessPayments,
  BusinessSales,
  ComparedMetric,
  PaymentReasonRow,
  ProfitCoverage,
  SalesPoint,
} from "@woobe/types";
import type {
  AbandonedCartAggregate,
  CategoryAggregate,
  CodOutstandingAggregate,
  CustomerAggregate,
  DailySalesRow,
  FulfillmentAggregate,
  InventorySnapshot,
  ProductAggregate,
  RawPaymentFailure,
  SalesAggregate,
} from "../application/ports/analytics-repository.port";
import { enumerateDates, weekStart, type DashboardWindow } from "./dashboard-period";
import { ABANDONED_CART_INACTIVITY_HOURS, PROFIT_EXCLUDED, PROFIT_INCLUDED } from "./metric-definitions";
import { PAYMENT_FAILURE_LABELS, normalizePaymentFailure, type PaymentFailureReason } from "./payment-failure-reason";
import { deltaPct, pct, ratioRounded } from "./rates";

export const compared = (value: number | null, previous: number | null, comparisonOn: boolean): ComparedMetric => ({
  value,
  previous: comparisonOn ? previous : null,
  deltaPct: comparisonOn ? deltaPct(value, previous) : null,
});

/** sum(lineTotal - coupon) - returned value: ex-tax, ex-shipping. */
export const netSalesPaise = (a: SalesAggregate): number => a.itemSalesPaise - a.couponDiscountPaise - a.returnedValuePaise;
export const netWeightGrams = (a: SalesAggregate): number => Math.max(0, a.weightGrams - a.returnedWeightGrams);
export const netUnits = (a: SalesAggregate): number => Math.max(0, a.units - a.returnedUnits);

export interface ProfitResult {
  /** null when no cost-covered sales exist — profit is unavailable, not zero. */
  profitPaise: number | null;
  coveredNetSalesPaise: number;
  coveragePct: number | null;
  grossMarginPct: number | null;
}

/** Known-cost profit: only items with a cost snapshot participate (see metric-definitions.ts). */
export function computeProfit(a: SalesAggregate): ProfitResult {
  const coveredNet = a.coveredItemNetPaise - a.coveredReturnedValuePaise;
  const net = netSalesPaise(a);
  if (a.coveredItemNetPaise <= 0) {
    return { profitPaise: null, coveredNetSalesPaise: 0, coveragePct: net > 0 ? 0 : null, grossMarginPct: null };
  }
  const profit = coveredNet - a.cogsPaise;
  const coverage = pct(coveredNet, net);
  return {
    profitPaise: profit,
    coveredNetSalesPaise: coveredNet,
    coveragePct: coverage === null ? null : Math.min(100, coverage),
    grossMarginPct: pct(profit, coveredNet),
  };
}

export function profitCoverageView(profit: ProfitResult): ProfitCoverage {
  return { coveragePct: profit.coveragePct, included: [...PROFIT_INCLUDED], excluded: [...PROFIT_EXCLUDED] };
}

export const revenuePerKgPaise = (a: SalesAggregate): number | null => {
  const grams = netWeightGrams(a);
  return grams > 0 ? Math.round((netSalesPaise(a) * 1000) / grams) : null;
};
export const averageOrderValuePaise = (a: SalesAggregate): number | null => ratioRounded(netSalesPaise(a), a.orders);

/** Zero-filled, bucketed (day or Monday-week) sales/profit/orders/kg/sessions series. */
export function buildSalesSeries(
  window: DashboardWindow,
  bucket: "day" | "week",
  rows: DailySalesRow[],
  sessions: { date: string; sessions: number }[],
): SalesPoint[] {
  const key = (date: string) => (bucket === "week" ? weekStart(date) : date);
  interface Acc {
    net: number;
    covered: number;
    cogs: number;
    orders: number;
    grams: number;
    sessions: number;
  }
  const acc = new Map<string, Acc>();
  const at = (date: string): Acc => {
    const k = key(date);
    let a = acc.get(k);
    if (!a) {
      a = { net: 0, covered: 0, cogs: 0, orders: 0, grams: 0, sessions: 0 };
      acc.set(k, a);
    }
    return a;
  };
  for (const date of enumerateDates(window)) at(date); // zero-fill every bucket
  for (const r of rows) {
    const a = at(r.date);
    a.net += r.itemNetPaise - r.returnedValuePaise;
    a.covered += r.coveredItemNetPaise - r.coveredReturnedValuePaise;
    a.cogs += r.cogsPaise;
    a.orders += r.orders;
    a.grams += r.weightGrams - r.returnedWeightGrams;
  }
  for (const s of sessions) at(s.date).sessions += s.sessions;
  return [...acc.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, a]) => ({
      date,
      netSalesPaise: a.net,
      // A bucket with no cost-covered sales has no honest profit figure.
      knownCostProfitPaise: a.covered > 0 || a.cogs > 0 ? a.covered - a.cogs : null,
      orders: a.orders,
      weightGrams: Math.max(0, a.grams),
      sessions: a.sessions,
    }));
}

export function buildSalesView(a: SalesAggregate, series: SalesPoint[]): BusinessSales {
  const profit = computeProfit(a);
  const discounts = a.offerDiscountPaise + a.couponDiscountPaise;
  const grams = netWeightGrams(a);
  return {
    grossSalesPaise: a.grossSalesPaise,
    offerDiscountPaise: a.offerDiscountPaise,
    couponDiscountPaise: a.couponDiscountPaise,
    discountsTotalPaise: discounts,
    discountRatePct: pct(discounts, a.grossSalesPaise),
    refundsPaise: a.refundCashPaise,
    refundedOrders: a.refundedOrders,
    refundRatePct: pct(a.refundedOrders, a.orders),
    netSalesPaise: netSalesPaise(a),
    shippingRevenuePaise: a.shippingRevenuePaise,
    taxCollectedPaise: a.taxPaise,
    averageKgPerOrder: a.orders > 0 ? Math.round((grams / 1000 / a.orders) * 100) / 100 : null,
    grossMarginPct: profit.grossMarginPct,
    onlineOrders: a.onlineOrders,
    codOrders: a.codOrders,
    onlineSharePct: pct(a.onlineOrders, a.orders),
    profit: profitCoverageView(profit),
    series,
  };
}

const STATUS_LABELS: Record<string, string> = {
  CONFIRMED: "Confirmed",
  PROCESSING: "Processing",
  PACKED: "Packed",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  RETURNED_TO_ORIGIN: "Returned to origin",
  CANCELLED: "Cancelled",
  PAYMENT_FAILED: "Payment failed",
  PENDING_PAYMENT: "Awaiting payment",
};
/** Display order = the order lifecycle, so the stacked bar reads left-to-right as the journey. */
const STATUS_ORDER = ["PENDING_PAYMENT", "CONFIRMED", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED", "RETURNED_TO_ORIGIN", "CANCELLED", "PAYMENT_FAILED"];

export function buildFulfillmentView(f: FulfillmentAggregate, cod: CodOutstandingAggregate, pendingReturns: number): BusinessFulfillment {
  const counts = new Map(f.statusCounts.map((s) => [s.status, s.count]));
  return {
    statuses: STATUS_ORDER.map((status) => ({ status, label: STATUS_LABELS[status] ?? status, count: counts.get(status) ?? 0 })),
    shipped: f.shipped,
    delivered: f.delivered,
    inTransit: f.inTransit,
    rtoOrders: f.rtoOrders,
    rtoValuePaise: f.rtoValuePaise,
    rtoRatePct: pct(f.rtoOrders, f.shipped),
    deliverySuccessRatePct: pct(f.delivered, f.delivered + f.rtoOrders),
    codOutstandingPaise: cod.amountPaise,
    codOutstandingOrders: cod.orders,
    pendingReturns,
  };
}

export function buildPaymentsView(failures: RawPaymentFailure[], successful: number): BusinessPayments {
  const byReason = new Map<PaymentFailureReason, number>();
  let failedAmount = 0;
  for (const failure of failures) {
    const reason = normalizePaymentFailure(failure);
    byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
    failedAmount += failure.amountPaise;
  }
  const total = failures.length;
  const reasons: PaymentReasonRow[] = [...byReason.entries()]
    .map(([reason, count]) => ({ reason, label: PAYMENT_FAILURE_LABELS[reason], count, pct: pct(count, total) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return {
    failedAttempts: total,
    failedAmountPaise: failedAmount,
    successfulPayments: successful,
    failureRatePct: pct(total, total + successful),
    reasons,
  };
}

export function buildMerchandisingView(categories: CategoryAggregate[], bestSellers: ProductAggregate[]): BusinessMerchandising {
  return {
    categories: [...categories].sort((a, b) => b.netSalesPaise - a.netSalesPaise || a.name.localeCompare(b.name)),
    bestSellers,
  };
}

export function buildInventoryView(snapshot: InventorySnapshot, unitsSoldNet: number): BusinessInventory {
  return {
    valueAtCostPaise: snapshot.valueAtCostPaise,
    retailValuePaise: snapshot.retailValuePaise,
    units: snapshot.units,
    weightGrams: snapshot.weightGrams,
    lowStockSkus: snapshot.lowStockSkus,
    outOfStockSkus: snapshot.outOfStockSkus,
    sellThroughPct: pct(unitsSoldNet, unitsSoldNet + snapshot.units),
    costCoveragePct: pct(snapshot.unitsWithCost, snapshot.units),
    byCategory: snapshot.byCategory,
    lowStock: snapshot.lowStock,
  };
}

export function buildCustomersView(c: CustomerAggregate, visitors: number): BusinessCustomers {
  return {
    visitors,
    buyers: c.buyers,
    newBuyers: c.newBuyers,
    returningBuyers: Math.max(0, c.buyers - c.newBuyers),
    repeatBuyers: c.repeatBuyers,
    repeatRatePct: pct(c.repeatBuyers, c.buyers),
    newRegistrations: c.newRegistrations,
  };
}

export function buildAbandonedCartsView(a: AbandonedCartAggregate): BusinessAbandonedCarts {
  return {
    count: a.abandoned,
    estimatedValuePaise: a.estimatedValuePaise,
    ratePct: pct(a.abandoned, a.abandoned + a.ordersPlaced),
    inactivityHours: ABANDONED_CART_INACTIVITY_HOURS,
  };
}
