import type { DashboardWindow } from "../../domain/dashboard-period";

/** Raw, additive aggregates for one window — the use-case (and pure functions) derive every rate/net figure from these, so nothing is computed from partially-aggregated numbers on the client. */
export interface SalesAggregate {
  orders: number;
  onlineOrders: number;
  codOrders: number;
  shippingRevenuePaise: number;
  taxPaise: number;
  units: number;
  weightGrams: number;
  grossSalesPaise: number;
  offerDiscountPaise: number;
  couponDiscountPaise: number;
  /** sum(lineTotal) — offer-adjusted, pre-coupon, ex-tax. */
  itemSalesPaise: number;
  /** COGS of items that carry a cost snapshot. */
  cogsPaise: number;
  /** sum(lineTotal - couponShare) of items that carry a cost snapshot. */
  coveredItemNetPaise: number;
  returnedValuePaise: number;
  returnedUnits: number;
  returnedWeightGrams: number;
  coveredReturnedValuePaise: number;
  refundCashPaise: number;
  refundedOrders: number;
}

export interface DailySalesRow {
  date: string;
  orders: number;
  itemNetPaise: number;
  weightGrams: number;
  coveredItemNetPaise: number;
  cogsPaise: number;
  returnedValuePaise: number;
  returnedWeightGrams: number;
  coveredReturnedValuePaise: number;
}

export interface FulfillmentAggregate {
  statusCounts: { status: string; count: number }[];
  shipped: number;
  delivered: number;
  inTransit: number;
  rtoOrders: number;
  rtoValuePaise: number;
}

export interface CodOutstandingAggregate {
  orders: number;
  amountPaise: number;
}

export interface RawPaymentFailure {
  code: string | null;
  reason: string | null;
  description: string | null;
  amountPaise: number;
}

export interface CategoryAggregate {
  categoryId: string;
  name: string;
  netSalesPaise: number;
  units: number;
  weightGrams: number;
}

export interface ProductAggregate {
  productId: string;
  name: string;
  slug: string;
  units: number;
  netSalesPaise: number;
  weightGrams: number;
}

export interface InventorySnapshot {
  units: number;
  weightGrams: number;
  valueAtCostPaise: number;
  retailValuePaise: number;
  unitsWithCost: number;
  lowStockSkus: number;
  outOfStockSkus: number;
  byCategory: { categoryId: string; name: string; units: number; weightGrams: number; valueAtCostPaise: number }[];
  lowStock: {
    variantId: string;
    productId: string;
    productName: string;
    sku: string;
    color: string;
    size: string;
    sellable: number;
    weightGrams: number;
    valueAtCostPaise: number | null;
  }[];
}

export interface CustomerAggregate {
  buyers: number;
  newBuyers: number;
  repeatBuyers: number;
  newRegistrations: number;
}

export interface FunnelAggregate {
  sessions: number;
  productViews: number;
  addToCart: number;
  checkout: number;
  paidOrders: number;
}

export interface AbandonedCartAggregate {
  abandoned: number;
  estimatedValuePaise: number;
  ordersPlaced: number;
}

/** Read side of the business dashboard. One method per panel, each a single bounded query (no N+1). */
export interface AnalyticsRepositoryPort {
  getSales(window: DashboardWindow): Promise<SalesAggregate>;
  getDailySales(window: DashboardWindow): Promise<DailySalesRow[]>;
  getSessionsByDay(window: DashboardWindow): Promise<{ date: string; sessions: number }[]>;
  getFulfillment(window: DashboardWindow): Promise<FulfillmentAggregate>;
  getCodOutstanding(): Promise<CodOutstandingAggregate>;
  getPendingReturnsCount(): Promise<number>;
  getPaymentFailures(window: DashboardWindow): Promise<RawPaymentFailure[]>;
  getSuccessfulPaymentCount(window: DashboardWindow): Promise<number>;
  getCategoryAggregates(window: DashboardWindow): Promise<CategoryAggregate[]>;
  getBestSellers(window: DashboardWindow, limit: number): Promise<ProductAggregate[]>;
  getInventory(lowStockLimit: number): Promise<InventorySnapshot>;
  getCustomers(window: DashboardWindow): Promise<CustomerAggregate>;
  getFunnel(window: DashboardWindow): Promise<FunnelAggregate>;
  getAbandonedCarts(window: DashboardWindow, cutoff: Date): Promise<AbandonedCartAggregate>;
}
