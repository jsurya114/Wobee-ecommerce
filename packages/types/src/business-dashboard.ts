/**
 * Admin business-analytics dashboard contract (2026-09-21) — the ONE typed
 * payload `GET /api/v1/admin/analytics/dashboard` returns, shared by the API
 * (which builds it) and apps/admin (which renders it). Every number is
 * computed server-side; the UI only formats. Money is integer paise, weight is
 * integer grams, rates are percentages 0-100 (rounded to 1 dp), and any figure
 * that cannot be computed honestly is `null` — never 0, NaN or a guess.
 *
 * Metric definitions live in apps/api/src/modules/analytics/domain/
 * metric-definitions.ts (documented once, next to the SQL that implements them).
 */

export const DASHBOARD_RANGES = ["today", "7d", "30d", "90d", "mtd", "custom"] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

export const DASHBOARD_COMPARE_MODES = ["previous", "none"] as const;
export type DashboardCompare = (typeof DASHBOARD_COMPARE_MODES)[number];

/** Business timezone every "day" boundary and daily bucket uses (IST has no DST). */
export const DASHBOARD_TIMEZONE = "Asia/Kolkata";

/** A metric for the selected period plus the previous equivalent period. `deltaPct` is null unless a meaningful comparison exists (compare on, previous > 0). */
export interface ComparedMetric {
  value: number | null;
  previous: number | null;
  deltaPct: number | null;
}

export interface DashboardPeriodView {
  range: DashboardRange;
  compare: DashboardCompare;
  timezone: typeof DASHBOARD_TIMEZONE;
  /** Inclusive IST calendar dates, YYYY-MM-DD. */
  current: { from: string; to: string; days: number };
  previous: { from: string; to: string } | null;
  /** Time-series granularity: daily up to 45 days, weekly (Mon-start) beyond. */
  bucket: "day" | "week";
  generatedAt: string;
}

export interface SalesPoint {
  /** YYYY-MM-DD (day) or the Monday of the week (week). */
  date: string;
  netSalesPaise: number;
  /** Known-cost profit for the bucket; null when no cost-covered sales fall in it. */
  knownCostProfitPaise: number | null;
  orders: number;
  weightGrams: number;
  /** Anonymous sessions started that day (traffic overlay). */
  sessions: number;
}

export interface ProfitCoverage {
  /** Share (0-100) of net sales whose items had a cost snapshot. null when there were no sales. */
  coveragePct: number | null;
  /** Human labels — what the profit figure does and does not include. */
  included: string[];
  excluded: string[];
}

export interface BusinessOverview {
  netSales: ComparedMetric;
  knownCostProfit: ComparedMetric;
  orders: ComparedMetric;
  averageOrderValue: ComparedMetric;
  kgSold: ComparedMetric;
  revenuePerKg: ComparedMetric;
  conversionRate: ComparedMetric;
  /** As-of-now (not period-scoped), so `previous`/`deltaPct` are null. */
  inventoryValueAtCost: ComparedMetric;
  inventoryCoveragePct: number | null;
}

export interface BusinessSales {
  grossSalesPaise: number;
  offerDiscountPaise: number;
  couponDiscountPaise: number;
  discountsTotalPaise: number;
  /** Discounts / (gross sales), 0-100; null when there were no sales. */
  discountRatePct: number | null;
  refundsPaise: number;
  refundedOrders: number;
  /** Refunded orders / realized orders. */
  refundRatePct: number | null;
  netSalesPaise: number;
  shippingRevenuePaise: number;
  taxCollectedPaise: number;
  averageKgPerOrder: number | null;
  grossMarginPct: number | null;
  onlineOrders: number;
  codOrders: number;
  onlineSharePct: number | null;
  profit: ProfitCoverage;
  series: SalesPoint[];
}

export interface FunnelStep {
  key: "visitors" | "productViews" | "addToCart" | "checkout" | "paidOrders";
  label: string;
  count: number;
  /** % of the first step (visitors). */
  pctOfVisitors: number | null;
  /** % of the previous step; null for the first step. */
  stepConversionPct: number | null;
  /** 100 - stepConversionPct; null for the first step. */
  dropOffPct: number | null;
}

export interface BusinessFunnel {
  steps: FunnelStep[];
  overallConversionPct: number | null;
  checkoutCompletionPct: number | null;
  /** Whether any sessions were tracked at all — false renders "tracking not collecting yet". */
  hasData: boolean;
}

export interface FulfillmentStatusCount {
  status: string;
  label: string;
  count: number;
}

export interface BusinessFulfillment {
  statuses: FulfillmentStatusCount[];
  /** Orders shipped in the period, by where they stand now (cohort). */
  shipped: number;
  delivered: number;
  inTransit: number;
  rtoOrders: number;
  rtoValuePaise: number;
  rtoRatePct: number | null;
  /** delivered / (delivered + RTO) — only orders with a final outcome. */
  deliverySuccessRatePct: number | null;
  /** As-of-now: COD orders not yet collected. */
  codOutstandingPaise: number;
  codOutstandingOrders: number;
  /** As-of-now: customer returns waiting for an admin decision (RETURN_REQUESTED). */
  pendingReturns: number;
}

export interface PaymentReasonRow {
  reason: string;
  label: string;
  count: number;
  pct: number;
}

export interface BusinessPayments {
  failedAttempts: number;
  failedAmountPaise: number;
  successfulPayments: number;
  failureRatePct: number | null;
  reasons: PaymentReasonRow[];
}

export interface CategoryMetricRow {
  categoryId: string;
  name: string;
  netSalesPaise: number;
  units: number;
  weightGrams: number;
}

export interface BestSellerRow {
  productId: string;
  name: string;
  slug: string;
  units: number;
  netSalesPaise: number;
  weightGrams: number;
}

export interface BusinessMerchandising {
  categories: CategoryMetricRow[];
  bestSellers: BestSellerRow[];
}

export interface InventoryCategoryRow {
  categoryId: string;
  name: string;
  units: number;
  weightGrams: number;
  valueAtCostPaise: number;
}

export interface LowStockRow {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  color: string;
  size: string;
  sellable: number;
  weightGrams: number;
  /** null when the variant has no configured cost. */
  valueAtCostPaise: number | null;
}

export interface BusinessInventory {
  valueAtCostPaise: number;
  retailValuePaise: number;
  units: number;
  weightGrams: number;
  lowStockSkus: number;
  outOfStockSkus: number;
  /** Units sold in the period / (units sold + units on hand now). */
  sellThroughPct: number | null;
  /** Share (0-100) of on-hand units that have a configured cost. */
  costCoveragePct: number | null;
  byCategory: InventoryCategoryRow[];
  lowStock: LowStockRow[];
}

export interface BusinessCustomers {
  visitors: number;
  buyers: number;
  newBuyers: number;
  returningBuyers: number;
  repeatBuyers: number;
  repeatRatePct: number | null;
  newRegistrations: number;
}

export interface BusinessAbandonedCarts {
  count: number;
  /** Value of the abandoned carts' items at CURRENT prices (carts don't snapshot price). */
  estimatedValuePaise: number;
  /** abandoned / (abandoned + converted). */
  ratePct: number | null;
  inactivityHours: number;
}

export interface BusinessDashboard {
  period: DashboardPeriodView;
  overview: BusinessOverview;
  sales: BusinessSales;
  funnel: BusinessFunnel;
  fulfillment: BusinessFulfillment;
  payments: BusinessPayments;
  merchandising: BusinessMerchandising;
  inventory: BusinessInventory;
  customers: BusinessCustomers;
  abandonedCarts: BusinessAbandonedCarts;
}
