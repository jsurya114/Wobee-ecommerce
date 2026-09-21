import type { BusinessDashboard, DashboardCompare, DashboardRange } from "@woobe/types";
import { DASHBOARD_TIMEZONE } from "@woobe/types";
import {
  buildAbandonedCartsView,
  buildCustomersView,
  buildFulfillmentView,
  buildInventoryView,
  buildMerchandisingView,
  buildPaymentsView,
  buildSalesSeries,
  buildSalesView,
  averageOrderValuePaise,
  compared,
  computeProfit,
  netSalesPaise,
  netUnits,
  netWeightGrams,
  revenuePerKgPaise,
} from "../../domain/dashboard-calculations";
import { istDateString, resolveDashboardPeriod, windowInclusiveEndDate } from "../../domain/dashboard-period";
import { buildFunnel } from "../../domain/funnel";
import { ABANDONED_CART_INACTIVITY_MS } from "../../domain/metric-definitions";
import type { AnalyticsRepositoryPort } from "../ports/analytics-repository.port";
import { TtlCache } from "../ttl-cache";

export interface BusinessDashboardQuery {
  range: DashboardRange;
  from?: string;
  to?: string;
  compare: DashboardCompare;
}

const BEST_SELLERS_LIMIT = 8;
const LOW_STOCK_LIMIT = 8;
export const DASHBOARD_CACHE_TTL_MS = 45_000;

/**
 * Builds the whole business dashboard from ONE date selection: every panel is
 * computed over the same resolved window (never a private period per panel),
 * plus the previous equivalent window for the KPI comparisons. All rates,
 * nets and deltas are computed here, server-side, from additive SQL aggregates
 * — the UI only formats. Definitions: ../../domain/metric-definitions.ts.
 *
 * Cached ~45 s (single-flight) keyed by the resolved window, so refreshes and
 * multiple admins don't re-run the ~25 aggregate queries.
 */
export class GetBusinessDashboardUseCase {
  private readonly cache: TtlCache<BusinessDashboard>;

  constructor(
    private readonly repository: AnalyticsRepositoryPort,
    private readonly clock: () => Date = () => new Date(),
    cacheTtlMs: number = DASHBOARD_CACHE_TTL_MS,
  ) {
    this.cache = new TtlCache(cacheTtlMs);
  }

  async execute(query: BusinessDashboardQuery): Promise<BusinessDashboard> {
    const now = this.clock();
    const period = resolveDashboardPeriod({ ...query, now });
    const cacheKey = [period.current.start.getTime(), period.current.end.getTime(), period.previous ? 1 : 0, period.range].join(":");
    return this.cache.getOrCompute(cacheKey, () => this.build(query, period, now));
  }

  private async build(query: BusinessDashboardQuery, period: ReturnType<typeof resolveDashboardPeriod>, now: Date): Promise<BusinessDashboard> {
    const repo = this.repository;
    const w = period.current;
    const comparisonOn = period.previous !== null;
    const abandonedCutoff = new Date(now.getTime() - ABANDONED_CART_INACTIVITY_MS);

    const [
      sales,
      previousSales,
      dailySales,
      sessionsByDay,
      fulfillment,
      cod,
      pendingReturns,
      failures,
      successfulPayments,
      categories,
      bestSellers,
      inventory,
      customers,
      funnelCounts,
      previousFunnelCounts,
      abandoned,
    ] = await Promise.all([
      repo.getSales(w),
      period.previous ? repo.getSales(period.previous) : Promise.resolve(null),
      repo.getDailySales(w),
      repo.getSessionsByDay(w),
      repo.getFulfillment(w),
      repo.getCodOutstanding(),
      repo.getPendingReturnsCount(),
      repo.getPaymentFailures(w),
      repo.getSuccessfulPaymentCount(w),
      repo.getCategoryAggregates(w),
      repo.getBestSellers(w, BEST_SELLERS_LIMIT),
      repo.getInventory(LOW_STOCK_LIMIT),
      repo.getCustomers(w),
      repo.getFunnel(w),
      period.previous ? repo.getFunnel(period.previous) : Promise.resolve(null),
      repo.getAbandonedCarts(w, abandonedCutoff),
    ]);

    const funnel = buildFunnel(funnelCounts);
    const previousFunnel = previousFunnelCounts ? buildFunnel(previousFunnelCounts) : null;
    const profit = computeProfit(sales);
    const previousProfit = previousSales ? computeProfit(previousSales) : null;
    const inventoryView = buildInventoryView(inventory, netUnits(sales));
    const series = buildSalesSeries(w, period.bucket, dailySales, sessionsByDay);

    const kg = (grams: number) => Math.round((grams / 1000) * 100) / 100;

    return {
      period: {
        range: period.range,
        compare: period.compare,
        timezone: DASHBOARD_TIMEZONE,
        current: { from: istDateString(w.start), to: windowInclusiveEndDate(w), days: period.days },
        previous: period.previous ? { from: istDateString(period.previous.start), to: windowInclusiveEndDate(period.previous) } : null,
        bucket: period.bucket,
        generatedAt: now.toISOString(),
      },
      overview: {
        netSales: compared(netSalesPaise(sales), previousSales ? netSalesPaise(previousSales) : null, comparisonOn),
        knownCostProfit: compared(profit.profitPaise, previousProfit?.profitPaise ?? null, comparisonOn),
        orders: compared(sales.orders, previousSales?.orders ?? null, comparisonOn),
        averageOrderValue: compared(averageOrderValuePaise(sales), previousSales ? averageOrderValuePaise(previousSales) : null, comparisonOn),
        kgSold: compared(kg(netWeightGrams(sales)), previousSales ? kg(netWeightGrams(previousSales)) : null, comparisonOn),
        revenuePerKg: compared(revenuePerKgPaise(sales), previousSales ? revenuePerKgPaise(previousSales) : null, comparisonOn),
        conversionRate: compared(funnel.overallConversionPct, previousFunnel?.overallConversionPct ?? null, comparisonOn),
        // As-of-now: there is no historical inventory ledger, so no comparison is offered.
        // No configured cost on ANY on-hand unit (or no stock) means the value is unknown — null, never a misleading ₹0.
        inventoryValueAtCost: { value: (inventoryView.costCoveragePct ?? 0) > 0 ? inventoryView.valueAtCostPaise : null, previous: null, deltaPct: null },
        inventoryCoveragePct: inventoryView.costCoveragePct,
      },
      sales: buildSalesView(sales, series),
      funnel,
      fulfillment: buildFulfillmentView(fulfillment, cod, pendingReturns),
      payments: buildPaymentsView(failures, successfulPayments),
      merchandising: buildMerchandisingView(categories, bestSellers),
      inventory: inventoryView,
      customers: buildCustomersView(customers, funnel.steps[0]!.count),
      abandonedCarts: buildAbandonedCartsView(abandoned),
    };
  }
}
