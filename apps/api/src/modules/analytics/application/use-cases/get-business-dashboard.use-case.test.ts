import { describe, expect, it, vi } from "vitest";
import type { AnalyticsRepositoryPort, SalesAggregate } from "../ports/analytics-repository.port";
import { GetBusinessDashboardUseCase } from "./get-business-dashboard.use-case";

const NOW = new Date("2026-09-22T06:00:00.000Z");

const zeroSales: SalesAggregate = {
  orders: 0, onlineOrders: 0, codOrders: 0, shippingRevenuePaise: 0, taxPaise: 0, units: 0, weightGrams: 0, grossSalesPaise: 0,
  offerDiscountPaise: 0, couponDiscountPaise: 0, itemSalesPaise: 0, cogsPaise: 0, coveredItemNetPaise: 0, returnedValuePaise: 0,
  returnedUnits: 0, returnedWeightGrams: 0, coveredReturnedValuePaise: 0, refundCashPaise: 0, refundedOrders: 0,
};

function fakeRepo(overrides: Partial<AnalyticsRepositoryPort> = {}): AnalyticsRepositoryPort {
  return {
    getSales: vi.fn().mockResolvedValue(zeroSales),
    getDailySales: vi.fn().mockResolvedValue([]),
    getSessionsByDay: vi.fn().mockResolvedValue([]),
    getFulfillment: vi.fn().mockResolvedValue({ statusCounts: [], shipped: 0, delivered: 0, inTransit: 0, rtoOrders: 0, rtoValuePaise: 0 }),
    getCodOutstanding: vi.fn().mockResolvedValue({ orders: 0, amountPaise: 0 }),
    getPendingReturnsCount: vi.fn().mockResolvedValue(0),
    getPaymentFailures: vi.fn().mockResolvedValue([]),
    getSuccessfulPaymentCount: vi.fn().mockResolvedValue(0),
    getCategoryAggregates: vi.fn().mockResolvedValue([]),
    getBestSellers: vi.fn().mockResolvedValue([]),
    getInventory: vi.fn().mockResolvedValue({ units: 0, weightGrams: 0, valueAtCostPaise: 0, retailValuePaise: 0, unitsWithCost: 0, lowStockSkus: 0, outOfStockSkus: 0, byCategory: [], lowStock: [] }),
    getCustomers: vi.fn().mockResolvedValue({ buyers: 0, newBuyers: 0, repeatBuyers: 0, newRegistrations: 0 }),
    getFunnel: vi.fn().mockResolvedValue({ sessions: 0, productViews: 0, addToCart: 0, checkout: 0, paidOrders: 0 }),
    getAbandonedCarts: vi.fn().mockResolvedValue({ abandoned: 0, estimatedValuePaise: 0, ordersPlaced: 0 }),
    ...overrides,
  };
}

describe("GetBusinessDashboardUseCase", () => {
  it("an empty production database yields a fully-formed payload with null (not 0/NaN) for every undefined rate", async () => {
    const dashboard = await new GetBusinessDashboardUseCase(fakeRepo(), () => NOW).execute({ range: "30d", compare: "previous" });
    expect(dashboard.overview.netSales.value).toBe(0);
    expect(dashboard.overview.knownCostProfit.value).toBeNull();
    expect(dashboard.overview.averageOrderValue.value).toBeNull();
    expect(dashboard.overview.revenuePerKg.value).toBeNull();
    expect(dashboard.overview.conversionRate.value).toBeNull();
    expect(dashboard.overview.inventoryValueAtCost.value).toBeNull();
    expect(dashboard.funnel.hasData).toBe(false);
    expect(dashboard.payments.reasons).toEqual([]);
    expect(dashboard.merchandising.categories).toEqual([]);
    expect(dashboard.sales.series).toHaveLength(30);
    expect(JSON.stringify(dashboard)).not.toMatch(/NaN|Infinity|undefined/);
  });

  it("every panel query uses the SAME current window (one date filter drives all panels)", async () => {
    const repo = fakeRepo();
    await new GetBusinessDashboardUseCase(repo, () => NOW).execute({ range: "7d", compare: "none" });
    const windows = [
      vi.mocked(repo.getSales).mock.calls[0]![0],
      vi.mocked(repo.getDailySales).mock.calls[0]![0],
      vi.mocked(repo.getSessionsByDay).mock.calls[0]![0],
      vi.mocked(repo.getFulfillment).mock.calls[0]![0],
      vi.mocked(repo.getPaymentFailures).mock.calls[0]![0],
      vi.mocked(repo.getSuccessfulPaymentCount).mock.calls[0]![0],
      vi.mocked(repo.getCategoryAggregates).mock.calls[0]![0],
      vi.mocked(repo.getBestSellers).mock.calls[0]![0],
      vi.mocked(repo.getCustomers).mock.calls[0]![0],
      vi.mocked(repo.getFunnel).mock.calls[0]![0],
      vi.mocked(repo.getAbandonedCarts).mock.calls[0]![0],
    ];
    for (const w of windows) {
      expect(w.start.getTime()).toBe(windows[0]!.start.getTime());
      expect(w.end.getTime()).toBe(windows[0]!.end.getTime());
    }
  });

  it("compare=none never queries a previous window and reports no deltas", async () => {
    const repo = fakeRepo();
    const d = await new GetBusinessDashboardUseCase(repo, () => NOW).execute({ range: "7d", compare: "none" });
    expect(repo.getSales).toHaveBeenCalledTimes(1);
    expect(repo.getFunnel).toHaveBeenCalledTimes(1);
    expect(d.period.previous).toBeNull();
    expect(d.overview.netSales.deltaPct).toBeNull();
  });

  it("compare=previous computes deltas, and a zero previous period yields a null delta", async () => {
    const getSales = vi
      .fn()
      .mockResolvedValueOnce({ ...zeroSales, orders: 3, itemSalesPaise: 300_000, weightGrams: 3_000 })
      .mockResolvedValueOnce({ ...zeroSales, orders: 2, itemSalesPaise: 200_000, weightGrams: 2_000 });
    const d = await new GetBusinessDashboardUseCase(fakeRepo({ getSales }), () => NOW).execute({ range: "7d", compare: "previous" });
    expect(d.overview.netSales).toEqual({ value: 300_000, previous: 200_000, deltaPct: 50 });
    expect(d.overview.kgSold.value).toBe(3);

    const zeroPrev = vi.fn().mockResolvedValueOnce({ ...zeroSales, orders: 3, itemSalesPaise: 300_000 }).mockResolvedValueOnce(zeroSales);
    const d2 = await new GetBusinessDashboardUseCase(fakeRepo({ getSales: zeroPrev }), () => NOW).execute({ range: "7d", compare: "previous" });
    expect(d2.overview.netSales.deltaPct).toBeNull();
    expect(d2.overview.netSales.previous).toBe(0);
  });

  it("inventory value is null (not ₹0) when no on-hand unit has a configured cost", async () => {
    const repo = fakeRepo({ getInventory: vi.fn().mockResolvedValue({ units: 40, weightGrams: 9_000, valueAtCostPaise: 0, retailValuePaise: 400_000, unitsWithCost: 0, lowStockSkus: 0, outOfStockSkus: 0, byCategory: [], lowStock: [] }) });
    const d = await new GetBusinessDashboardUseCase(repo, () => NOW).execute({ range: "30d", compare: "none" });
    expect(d.overview.inventoryValueAtCost.value).toBeNull();
    expect(d.inventory.retailValuePaise).toBe(400_000); // retail stays separate and labelled
    expect(d.overview.inventoryCoveragePct).toBe(0);
  });

  it("caches per window: an immediate repeat does not re-query", async () => {
    const repo = fakeRepo();
    const uc = new GetBusinessDashboardUseCase(repo, () => NOW);
    await uc.execute({ range: "30d", compare: "previous" });
    await uc.execute({ range: "30d", compare: "previous" });
    expect(repo.getSales).toHaveBeenCalledTimes(2); // current + previous, once
    await uc.execute({ range: "7d", compare: "previous" });
    expect(repo.getSales).toHaveBeenCalledTimes(4); // a different window is a new computation
  });

  it("passes the 24h abandoned-cart cutoff derived from the injected clock", async () => {
    const repo = fakeRepo();
    await new GetBusinessDashboardUseCase(repo, () => NOW).execute({ range: "30d", compare: "none" });
    const cutoff = vi.mocked(repo.getAbandonedCarts).mock.calls[0]![1];
    expect(cutoff.toISOString()).toBe("2026-09-21T06:00:00.000Z");
  });
});
