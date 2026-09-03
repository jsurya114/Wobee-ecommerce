import type { AnalyticsDateRange, OrderAnalyticsView, OrderStatusCount } from "../../../orders/application/ports/order-repository.port";
import type { PaymentCollectionSummary } from "../../../payments/application/ports/payment-repository.port";
import type { AdminInventoryRow } from "../../../inventory/application/ports/inventory-repository.port";

/** Matches `GetOrderAnalyticsUseCase`'s own `execute` signature. */
interface OrderAnalyticsReader {
  execute(range: AnalyticsDateRange): Promise<OrderAnalyticsView>;
}

/** Matches `GetPaymentCollectionSummaryUseCase`'s own `execute` signature. */
interface PaymentCollectionReader {
  execute(range: AnalyticsDateRange): Promise<PaymentCollectionSummary>;
}

/** Matches `ListCustomersAdminUseCase`'s own `execute` signature — only `.total` is read here, reusing the existing filter/count rather than a new method (see ListCustomersFilter's own doc comment on createdAfter/createdBefore). */
interface CustomersCounter {
  execute(filter: { createdAfter: Date; createdBefore: Date; page: number; pageSize: number }): Promise<{ total: number }>;
}

/** Matches `GetBestSellingVariantQuantitiesUseCase`'s own `execute` signature — same interface `home`'s GetHomePageUseCase depends on for the identical reason (DIP, no coupling to the concrete class). */
interface BestSellingVariantsReader {
  execute(limit: number): Promise<{ variantId: string; quantitySold: number }[]>;
}

/** Matches `ResolveProductIdsForVariantsUseCase`'s own `execute` signature. */
interface VariantProductResolver {
  execute(variantIds: string[]): Promise<Map<string, string>>;
}

/** Matches `GetProductsByIdsUseCase`'s own `execute` signature — only name/slug are read here. */
interface ProductsByIdsReader {
  execute(productIds: string[]): Promise<Map<string, { name: string; slug: string }>>;
}

/** Matches `ListInventoryAdminUseCase`'s own `execute` signature. */
interface LowStockLister {
  execute(filter: { lowStockOnly: true; page: number; pageSize: number }): Promise<{ items: AdminInventoryRow[]; total: number }>;
}

/** Matches `ListReturnsForAdminUseCase`'s own `execute` signature — only `.total` is read here. */
interface PendingReturnsCounter {
  execute(filter: { status: "RETURN_REQUESTED"; page: number; pageSize: number }): Promise<{ total: number }>;
}

export interface DashboardBestSeller {
  productId: string;
  name: string;
  slug: string;
  quantitySold: number;
}

export interface AdminDashboardView {
  range: { from: string; to: string };
  revenue: {
    totalRevenuePaise: number;
    orderCount: number;
    averageOrderValuePaise: number;
    collectedPaise: number;
    pendingCodPaise: number;
  };
  dailyRevenue: OrderAnalyticsView["dailyRevenue"];
  statusCounts: OrderStatusCount[];
  newCustomersCount: number;
  /** All-time, not scoped to `range` — the underlying units-sold query (GetBestSellingVariantQuantitiesUseCase, shared with the storefront's own Best Sellers rail) has no date filter; see this use-case's own doc comment for why that's not worth splitting. */
  bestSellers: DashboardBestSeller[];
  lowStock: AdminInventoryRow[];
  lowStockTotal: number;
  pendingReturnsCount: number;
}

const BEST_SELLERS_LIMIT = 5;
const BEST_SELLERS_VARIANT_OVERFETCH = 20; // Same overfetch reasoning as GetHomePageUseCase's own rail: several variants can collapse into one product.
const LOW_STOCK_LIMIT = 5;

/**
 * The admin dashboard's landing-page rollup (client-review request,
 * 2026-09-03) — composed here, not in a new top-level module, for the same
 * reason `CancelOrderWithRefundUseCase`/`GetCustomerDetailUseCase` already
 * are: `admin` sits above `orders`, `payments`, `auth`, `inventory`, and
 * `returns` (imported by nothing but the app root) and has "no business
 * logic, no Prisma access of its own" (admin.module.ts's own top comment)
 * — every figure here comes from another module's already-exported,
 * already-tested use-case, run in parallel. Best-sellers resolution
 * mirrors `GetHomePageUseCase.resolveBestSellers()`'s own variant-to-product
 * collapsing exactly (same ranking-by-total-units-sold rule), reimplemented
 * rather than imported since that method is private to a different
 * module's use-case, not a shared export.
 */
export class GetAdminDashboardUseCase {
  constructor(
    private readonly orderAnalyticsReader: OrderAnalyticsReader,
    private readonly paymentCollectionReader: PaymentCollectionReader,
    private readonly customersCounter: CustomersCounter,
    private readonly bestSellingVariantsReader: BestSellingVariantsReader,
    private readonly variantProductResolver: VariantProductResolver,
    private readonly productsByIdsReader: ProductsByIdsReader,
    private readonly lowStockLister: LowStockLister,
    private readonly pendingReturnsCounter: PendingReturnsCounter,
  ) {}

  async execute(range: AnalyticsDateRange): Promise<AdminDashboardView> {
    const [orderAnalytics, collection, newCustomers, bestSellers, lowStock, pendingReturns] = await Promise.all([
      this.orderAnalyticsReader.execute(range),
      this.paymentCollectionReader.execute(range),
      this.customersCounter.execute({ createdAfter: range.from, createdBefore: range.to, page: 1, pageSize: 1 }),
      this.resolveBestSellers(),
      this.lowStockLister.execute({ lowStockOnly: true, page: 1, pageSize: LOW_STOCK_LIMIT }),
      this.pendingReturnsCounter.execute({ status: "RETURN_REQUESTED", page: 1, pageSize: 1 }),
    ]);

    return {
      range: { from: range.from.toISOString().slice(0, 10), to: range.to.toISOString().slice(0, 10) },
      revenue: {
        totalRevenuePaise: orderAnalytics.totalRevenuePaise,
        orderCount: orderAnalytics.orderCount,
        averageOrderValuePaise: orderAnalytics.averageOrderValuePaise,
        collectedPaise: collection.collectedPaise,
        pendingCodPaise: collection.pendingCodPaise,
      },
      dailyRevenue: orderAnalytics.dailyRevenue,
      statusCounts: orderAnalytics.statusCounts,
      newCustomersCount: newCustomers.total,
      bestSellers,
      lowStock: lowStock.items,
      lowStockTotal: lowStock.total,
      pendingReturnsCount: pendingReturns.total,
    };
  }

  private async resolveBestSellers(): Promise<DashboardBestSeller[]> {
    const variantSales = await this.bestSellingVariantsReader.execute(BEST_SELLERS_VARIANT_OVERFETCH);
    if (variantSales.length === 0) return [];

    const productIdByVariant = await this.variantProductResolver.execute(variantSales.map((sale) => sale.variantId));

    const quantityByProductId = new Map<string, number>();
    for (const sale of variantSales) {
      const productId = productIdByVariant.get(sale.variantId);
      if (!productId) continue; // Variant since deleted/reassigned — skip, don't fail the whole dashboard.
      quantityByProductId.set(productId, (quantityByProductId.get(productId) ?? 0) + sale.quantitySold);
    }

    const rankedProductIds = Array.from(quantityByProductId.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, BEST_SELLERS_LIMIT)
      .map(([productId]) => productId);

    const products = await this.productsByIdsReader.execute(rankedProductIds);

    return rankedProductIds
      .map((id) => {
        const product = products.get(id);
        return product ? { productId: id, name: product.name, slug: product.slug, quantitySold: quantityByProductId.get(id)! } : null;
      })
      .filter((entry): entry is DashboardBestSeller => entry !== null);
  }
}
