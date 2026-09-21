import { LOW_STOCK_THRESHOLD } from "@woobe/types";
import { Prisma, prisma } from "@woobe/database";
import type {
  AbandonedCartAggregate,
  AnalyticsRepositoryPort,
  CategoryAggregate,
  CodOutstandingAggregate,
  CustomerAggregate,
  DailySalesRow,
  FulfillmentAggregate,
  FunnelAggregate,
  InventorySnapshot,
  ProductAggregate,
  RawPaymentFailure,
  SalesAggregate,
} from "../application/ports/analytics-repository.port";
import type { DashboardWindow } from "../domain/dashboard-period";

/**
 * Postgres implementation of the dashboard's read side. Every query is one
 * grouped aggregation bounded by an indexed time window — no per-row loops, no
 * N+1. The definitions implemented here are documented in
 * ../domain/metric-definitions.ts; keep the two in step.
 *
 * Numeric columns are cast `::float8` so the driver returns plain JS numbers
 * (exact for paise/gram totals far beyond 2^53's practical reach) instead of
 * BigInt/Decimal; `num()` normalises NULL (an empty aggregate) to 0.
 */

const num = (value: unknown): number => (value == null ? 0 : Math.round(Number(value)));

/** Trusted constant only — never interpolate user input into this. */
const istDay = (column: string) =>
  Prisma.raw(`to_char((${column} AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')`);

/**
 * "Realized" orders (see metric-definitions.ts): online = paid and in a live
 * status, realized at placedAt; COD = delivered with cash collected, realized
 * at deliveredAt. Unbounded in time — every caller adds its own window.
 */
const REALIZED = Prisma.sql`
  realized AS (
    SELECT o.id, o."paymentMethod"::text AS method, o."shippingFeePaise", o."taxPaise", o."totalPaise",
           o."userId", lower(o."contactEmail") AS email,
           CASE WHEN o."paymentMethod" = 'COD' THEN o."deliveredAt" ELSE o."placedAt" END AS realized_at
    FROM orders o
    JOIN payments p ON p."orderId" = o.id
    WHERE p.status IN ('CAPTURED', 'REFUNDED')
      AND (
        (o."paymentMethod" = 'RAZORPAY' AND o.status IN ('CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED'))
        OR (o."paymentMethod" = 'COD' AND o.status = 'DELIVERED')
      )
  )`;

const inWindow = (column: Prisma.Sql, w: DashboardWindow) => Prisma.sql`${column} >= ${w.start} AND ${column} < ${w.end}`;

/** Value of a refunded return line ex-tax: (lineTotal - couponShare) x returnedQty / itemQty. */
const RETURNED_VALUE = Prisma.sql`ROUND((oi."lineTotalPaise" - oi."discountPaise")::numeric * ri.quantity / NULLIF(oi.quantity, 0))`;

/** Per-unit cost of a variant's CURRENT stock: FIXED -> variant cost, WEIGHT_BASED -> cost/kg x weight. NULL when not configured. */
const UNIT_COST = Prisma.sql`(CASE WHEN p."pricingMode" = 'FIXED' THEN v."costPricePaise"
                                   WHEN p."costPerKgPaise" IS NOT NULL THEN ROUND(p."costPerKgPaise"::numeric * v."weightGrams" / 1000)
                              END)`;

export class AnalyticsRepository implements AnalyticsRepositoryPort {
  async getSales(w: DashboardWindow): Promise<SalesAggregate> {
    const [orderRows, itemRows, returnRows, refundRows] = await Promise.all([
      prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
        WITH ${REALIZED}
        SELECT COUNT(*)::float8 AS orders,
               COUNT(*) FILTER (WHERE method = 'RAZORPAY')::float8 AS online_orders,
               COUNT(*) FILTER (WHERE method = 'COD')::float8 AS cod_orders,
               COALESCE(SUM("shippingFeePaise"), 0)::float8 AS shipping,
               COALESCE(SUM("taxPaise"), 0)::float8 AS tax
        FROM realized WHERE ${inWindow(Prisma.sql`realized_at`, w)}`),
      prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
        WITH ${REALIZED}
        SELECT COALESCE(SUM(oi.quantity), 0)::float8 AS units,
               COALESCE(SUM(oi.quantity * oi."weightGrams"), 0)::float8 AS weight,
               COALESCE(SUM(GREATEST(oi."basePricePaise", oi."unitPricePaise") * oi.quantity), 0)::float8 AS gross,
               COALESCE(SUM(oi."offerDiscountPaise"), 0)::float8 AS offer_disc,
               COALESCE(SUM(oi."discountPaise"), 0)::float8 AS coupon_disc,
               COALESCE(SUM(oi."lineTotalPaise"), 0)::float8 AS item_sales,
               COALESCE(SUM(oi.quantity * oi."unitCostPaiseSnapshot") FILTER (WHERE oi."unitCostPaiseSnapshot" IS NOT NULL), 0)::float8 AS cogs,
               COALESCE(SUM(oi."lineTotalPaise" - oi."discountPaise") FILTER (WHERE oi."unitCostPaiseSnapshot" IS NOT NULL), 0)::float8 AS covered_net
        FROM realized r JOIN order_items oi ON oi."orderId" = r.id
        WHERE ${inWindow(Prisma.sql`r.realized_at`, w)}`),
      prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
        WITH ${REALIZED}
        SELECT COALESCE(SUM(${RETURNED_VALUE}), 0)::float8 AS value,
               COALESCE(SUM(ri.quantity), 0)::float8 AS units,
               COALESCE(SUM(ri.quantity * oi."weightGrams"), 0)::float8 AS weight,
               COALESCE(SUM(${RETURNED_VALUE}) FILTER (WHERE oi."unitCostPaiseSnapshot" IS NOT NULL), 0)::float8 AS covered_value
        FROM refunds rf
        JOIN return_items ri ON ri."returnId" = rf."returnId"
        JOIN order_items oi ON oi.id = ri."orderItemId"
        WHERE rf."returnId" IS NOT NULL AND rf.status IN ('INITIATED', 'COMPLETED')
          AND ${inWindow(Prisma.sql`rf."createdAt"`, w)}
          AND rf."orderId" IN (SELECT id FROM realized)`),
      prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
        WITH ${REALIZED}
        SELECT COALESCE(SUM(rf."amountPaise"), 0)::float8 AS cash, COUNT(DISTINCT rf."orderId")::float8 AS refunded_orders
        FROM refunds rf
        WHERE rf.status IN ('INITIATED', 'COMPLETED') AND ${inWindow(Prisma.sql`rf."createdAt"`, w)}
          AND rf."orderId" IN (SELECT id FROM realized)`),
    ]);
    const o = orderRows[0] ?? {};
    const i = itemRows[0] ?? {};
    const r = returnRows[0] ?? {};
    const f = refundRows[0] ?? {};
    return {
      orders: num(o.orders),
      onlineOrders: num(o.online_orders),
      codOrders: num(o.cod_orders),
      shippingRevenuePaise: num(o.shipping),
      taxPaise: num(o.tax),
      units: num(i.units),
      weightGrams: num(i.weight),
      grossSalesPaise: num(i.gross),
      offerDiscountPaise: num(i.offer_disc),
      couponDiscountPaise: num(i.coupon_disc),
      itemSalesPaise: num(i.item_sales),
      cogsPaise: num(i.cogs),
      coveredItemNetPaise: num(i.covered_net),
      returnedValuePaise: num(r.value),
      returnedUnits: num(r.units),
      returnedWeightGrams: num(r.weight),
      coveredReturnedValuePaise: num(r.covered_value),
      refundCashPaise: num(f.cash),
      refundedOrders: num(f.refunded_orders),
    };
  }

  async getDailySales(w: DashboardWindow): Promise<DailySalesRow[]> {
    const [sales, returns] = await Promise.all([
      prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
        WITH ${REALIZED}
        SELECT ${istDay("r.realized_at")} AS day,
               COUNT(DISTINCT r.id)::float8 AS orders,
               COALESCE(SUM(oi."lineTotalPaise" - oi."discountPaise"), 0)::float8 AS item_net,
               COALESCE(SUM(oi.quantity * oi."weightGrams"), 0)::float8 AS weight,
               COALESCE(SUM(oi."lineTotalPaise" - oi."discountPaise") FILTER (WHERE oi."unitCostPaiseSnapshot" IS NOT NULL), 0)::float8 AS covered_net,
               COALESCE(SUM(oi.quantity * oi."unitCostPaiseSnapshot") FILTER (WHERE oi."unitCostPaiseSnapshot" IS NOT NULL), 0)::float8 AS cogs
        FROM realized r JOIN order_items oi ON oi."orderId" = r.id
        WHERE ${inWindow(Prisma.sql`r.realized_at`, w)}
        GROUP BY 1`),
      prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
        WITH ${REALIZED}
        SELECT ${istDay('rf."createdAt"')} AS day,
               COALESCE(SUM(${RETURNED_VALUE}), 0)::float8 AS value,
               COALESCE(SUM(ri.quantity * oi."weightGrams"), 0)::float8 AS weight,
               COALESCE(SUM(${RETURNED_VALUE}) FILTER (WHERE oi."unitCostPaiseSnapshot" IS NOT NULL), 0)::float8 AS covered_value
        FROM refunds rf
        JOIN return_items ri ON ri."returnId" = rf."returnId"
        JOIN order_items oi ON oi.id = ri."orderItemId"
        WHERE rf."returnId" IS NOT NULL AND rf.status IN ('INITIATED', 'COMPLETED')
          AND ${inWindow(Prisma.sql`rf."createdAt"`, w)}
          AND rf."orderId" IN (SELECT id FROM realized)
        GROUP BY 1`),
    ]);
    const byDay = new Map<string, DailySalesRow>();
    const row = (date: string): DailySalesRow => {
      let existing = byDay.get(date);
      if (!existing) {
        existing = { date, orders: 0, itemNetPaise: 0, weightGrams: 0, coveredItemNetPaise: 0, cogsPaise: 0, returnedValuePaise: 0, returnedWeightGrams: 0, coveredReturnedValuePaise: 0 };
        byDay.set(date, existing);
      }
      return existing;
    };
    for (const s of sales) {
      const d = row(String(s.day));
      d.orders = num(s.orders);
      d.itemNetPaise = num(s.item_net);
      d.weightGrams = num(s.weight);
      d.coveredItemNetPaise = num(s.covered_net);
      d.cogsPaise = num(s.cogs);
    }
    for (const r of returns) {
      const d = row(String(r.day));
      d.returnedValuePaise = num(r.value);
      d.returnedWeightGrams = num(r.weight);
      d.coveredReturnedValuePaise = num(r.covered_value);
    }
    return [...byDay.values()];
  }

  async getSessionsByDay(w: DashboardWindow): Promise<{ date: string; sessions: number }[]> {
    const rows = await prisma.$queryRaw<{ day: string; sessions: number }[]>(Prisma.sql`
      SELECT ${istDay('"createdAt"')} AS day, COUNT(*)::float8 AS sessions
      FROM analytics_events
      WHERE type = 'SESSION_STARTED' AND ${inWindow(Prisma.sql`"createdAt"`, w)}
      GROUP BY 1`);
    return rows.map((r) => ({ date: String(r.day), sessions: num(r.sessions) }));
  }

  async getFulfillment(w: DashboardWindow): Promise<FulfillmentAggregate> {
    const [statuses, cohort] = await Promise.all([
      prisma.$queryRaw<{ status: string; count: number }[]>(Prisma.sql`
        SELECT status::text AS status, COUNT(*)::float8 AS count FROM orders
        WHERE ${inWindow(Prisma.sql`"placedAt"`, w)} GROUP BY status`),
      prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
        SELECT COUNT(*)::float8 AS shipped,
               COUNT(*) FILTER (WHERE status = 'DELIVERED')::float8 AS delivered,
               COUNT(*) FILTER (WHERE status = 'SHIPPED')::float8 AS in_transit,
               COUNT(*) FILTER (WHERE status = 'RETURNED_TO_ORIGIN')::float8 AS rto,
               COALESCE(SUM("totalPaise") FILTER (WHERE status = 'RETURNED_TO_ORIGIN'), 0)::float8 AS rto_value
        FROM orders WHERE "shippedAt" IS NOT NULL AND ${inWindow(Prisma.sql`"shippedAt"`, w)}`),
    ]);
    const c = cohort[0] ?? {};
    return {
      statusCounts: statuses.map((s) => ({ status: s.status, count: num(s.count) })),
      shipped: num(c.shipped),
      delivered: num(c.delivered),
      inTransit: num(c.in_transit),
      rtoOrders: num(c.rto),
      rtoValuePaise: num(c.rto_value),
    };
  }

  async getCodOutstanding(): Promise<CodOutstandingAggregate> {
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT COUNT(*)::float8 AS orders, COALESCE(SUM(p."amountPaise"), 0)::float8 AS amount
      FROM orders o JOIN payments p ON p."orderId" = o.id
      WHERE o."paymentMethod" = 'COD' AND p.status = 'PENDING'
        AND o.status IN ('CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED')`);
    return { orders: num(rows[0]?.orders), amountPaise: num(rows[0]?.amount) };
  }

  async getPendingReturnsCount(): Promise<number> {
    const rows = await prisma.$queryRaw<{ n: number }[]>(Prisma.sql`SELECT COUNT(*)::float8 AS n FROM returns WHERE status = 'RETURN_REQUESTED'`);
    return num(rows[0]?.n);
  }

  async getPaymentFailures(w: DashboardWindow): Promise<RawPaymentFailure[]> {
    // Capped: a runaway gateway incident must not turn the dashboard into a full table read.
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT payload #>> '{payload,payment,entity,error_code}' AS code,
             payload #>> '{payload,payment,entity,error_reason}' AS reason,
             payload #>> '{payload,payment,entity,error_description}' AS description,
             CASE WHEN (payload #>> '{payload,payment,entity,amount}') ~ '^[0-9]+$'
                  THEN (payload #>> '{payload,payment,entity,amount}')::float8 ELSE 0 END AS amount
      FROM webhook_events
      WHERE provider = 'razorpay' AND "eventType" = 'payment.failed' AND ${inWindow(Prisma.sql`"createdAt"`, w)}
      LIMIT 20000`);
    return rows.map((r) => ({
      code: (r.code as string | null) ?? null,
      reason: (r.reason as string | null) ?? null,
      description: (r.description as string | null) ?? null,
      amountPaise: num(r.amount),
    }));
  }

  async getSuccessfulPaymentCount(w: DashboardWindow): Promise<number> {
    const rows = await prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
      SELECT COUNT(*)::float8 AS n FROM webhook_events
      WHERE provider = 'razorpay' AND "eventType" = 'payment.captured' AND ${inWindow(Prisma.sql`"createdAt"`, w)}`);
    return num(rows[0]?.n);
  }

  async getCategoryAggregates(w: DashboardWindow): Promise<CategoryAggregate[]> {
    const [sold, returned] = await Promise.all([
      prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
        WITH ${REALIZED}
        SELECT c.id AS category_id, c.name,
               COALESCE(SUM(oi."lineTotalPaise" - oi."discountPaise"), 0)::float8 AS net,
               COALESCE(SUM(oi.quantity), 0)::float8 AS units,
               COALESCE(SUM(oi.quantity * oi."weightGrams"), 0)::float8 AS weight
        FROM realized r
        JOIN order_items oi ON oi."orderId" = r.id
        JOIN product_variants v ON v.id = oi."variantId"
        JOIN products p ON p.id = v."productId"
        JOIN categories c ON c.id = p."categoryId"
        WHERE ${inWindow(Prisma.sql`r.realized_at`, w)}
        GROUP BY c.id, c.name`),
      prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
        WITH ${REALIZED}
        SELECT c.id AS category_id,
               COALESCE(SUM(${RETURNED_VALUE}), 0)::float8 AS net,
               COALESCE(SUM(ri.quantity), 0)::float8 AS units,
               COALESCE(SUM(ri.quantity * oi."weightGrams"), 0)::float8 AS weight
        FROM refunds rf
        JOIN return_items ri ON ri."returnId" = rf."returnId"
        JOIN order_items oi ON oi.id = ri."orderItemId"
        JOIN product_variants v ON v.id = oi."variantId"
        JOIN products p ON p.id = v."productId"
        JOIN categories c ON c.id = p."categoryId"
        WHERE rf."returnId" IS NOT NULL AND rf.status IN ('INITIATED', 'COMPLETED')
          AND ${inWindow(Prisma.sql`rf."createdAt"`, w)}
          AND rf."orderId" IN (SELECT id FROM realized)
        GROUP BY c.id`),
    ]);
    const returnedById = new Map(returned.map((r) => [String(r.category_id), r]));
    return sold
      .map((s) => {
        const r = returnedById.get(String(s.category_id));
        return {
          categoryId: String(s.category_id),
          name: String(s.name),
          netSalesPaise: num(s.net) - num(r?.net),
          units: num(s.units) - num(r?.units),
          weightGrams: num(s.weight) - num(r?.weight),
        };
      })
      .filter((row) => row.units > 0 || row.netSalesPaise > 0);
  }

  async getBestSellers(w: DashboardWindow, limit: number): Promise<ProductAggregate[]> {
    const [sold, returned] = await Promise.all([
      prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
        WITH ${REALIZED}
        SELECT p.id AS product_id, p.name, p.slug,
               COALESCE(SUM(oi.quantity), 0)::float8 AS units,
               COALESCE(SUM(oi."lineTotalPaise" - oi."discountPaise"), 0)::float8 AS net,
               COALESCE(SUM(oi.quantity * oi."weightGrams"), 0)::float8 AS weight
        FROM realized r
        JOIN order_items oi ON oi."orderId" = r.id
        JOIN product_variants v ON v.id = oi."variantId"
        JOIN products p ON p.id = v."productId"
        WHERE ${inWindow(Prisma.sql`r.realized_at`, w)}
        GROUP BY p.id, p.name, p.slug`),
      // Same returns adjustment as the category panel, so the two never disagree about a sale.
      prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
        WITH ${REALIZED}
        SELECT p.id AS product_id,
               COALESCE(SUM(${RETURNED_VALUE}), 0)::float8 AS net,
               COALESCE(SUM(ri.quantity), 0)::float8 AS units,
               COALESCE(SUM(ri.quantity * oi."weightGrams"), 0)::float8 AS weight
        FROM refunds rf
        JOIN return_items ri ON ri."returnId" = rf."returnId"
        JOIN order_items oi ON oi.id = ri."orderItemId"
        JOIN product_variants v ON v.id = oi."variantId"
        JOIN products p ON p.id = v."productId"
        WHERE rf."returnId" IS NOT NULL AND rf.status IN ('INITIATED', 'COMPLETED')
          AND ${inWindow(Prisma.sql`rf."createdAt"`, w)}
          AND rf."orderId" IN (SELECT id FROM realized)
        GROUP BY p.id`),
    ]);
    const returnedById = new Map(returned.map((r) => [String(r.product_id), r]));
    return sold
      .map((row) => {
        const r = returnedById.get(String(row.product_id));
        return {
          productId: String(row.product_id),
          name: String(row.name),
          slug: String(row.slug),
          units: num(row.units) - num(r?.units),
          netSalesPaise: num(row.net) - num(r?.net),
          weightGrams: num(row.weight) - num(r?.weight),
        };
      })
      .filter((row) => row.units > 0)
      .sort((x, y) => y.units - x.units || y.netSalesPaise - x.netSalesPaise || x.name.localeCompare(y.name))
      .slice(0, limit);
  }

  async getInventory(lowStockLimit: number): Promise<InventorySnapshot> {
    const [totals, byCategory, stockCounts, lowStock] = await Promise.all([
      prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
        SELECT COALESCE(SUM(i."quantityAvailable"), 0)::float8 AS units,
               COALESCE(SUM(i."quantityAvailable" * v."weightGrams"), 0)::float8 AS weight,
               COALESCE(SUM(i."quantityAvailable" * ${UNIT_COST}), 0)::float8 AS cost_value,
               COALESCE(SUM(i."quantityAvailable") FILTER (WHERE ${UNIT_COST} IS NOT NULL), 0)::float8 AS units_with_cost,
               COALESCE(SUM(i."quantityAvailable" * v."effectivePricePaiseCache"), 0)::float8 AS retail
        FROM inventory i
        JOIN product_variants v ON v.id = i."variantId"
        JOIN products p ON p.id = v."productId"`),
      prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
        SELECT c.id AS category_id, c.name,
               COALESCE(SUM(i."quantityAvailable"), 0)::float8 AS units,
               COALESCE(SUM(i."quantityAvailable" * v."weightGrams"), 0)::float8 AS weight,
               COALESCE(SUM(i."quantityAvailable" * ${UNIT_COST}), 0)::float8 AS cost_value
        FROM inventory i
        JOIN product_variants v ON v.id = i."variantId"
        JOIN products p ON p.id = v."productId"
        JOIN categories c ON c.id = p."categoryId"
        GROUP BY c.id, c.name
        HAVING SUM(i."quantityAvailable") > 0
        ORDER BY cost_value DESC, units DESC
        LIMIT 20`),
      prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
        SELECT COUNT(*) FILTER (WHERE i."quantityAvailable" - i."quantityReserved" > 0
                                  AND i."quantityAvailable" - i."quantityReserved" < ${LOW_STOCK_THRESHOLD})::float8 AS low,
               COUNT(*) FILTER (WHERE i."quantityAvailable" - i."quantityReserved" <= 0)::float8 AS oos
        FROM inventory i JOIN product_variants v ON v.id = i."variantId"
        WHERE v."isActive" = true`),
      prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
        SELECT v.id AS variant_id, p.id AS product_id, p.name AS product_name, v.sku, v.color, v.size,
               (i."quantityAvailable" - i."quantityReserved")::float8 AS sellable,
               v."weightGrams"::float8 AS weight,
               (i."quantityAvailable" * ${UNIT_COST})::float8 AS cost_value
        FROM inventory i
        JOIN product_variants v ON v.id = i."variantId"
        JOIN products p ON p.id = v."productId"
        WHERE v."isActive" = true
          AND i."quantityAvailable" - i."quantityReserved" > 0
          AND i."quantityAvailable" - i."quantityReserved" < ${LOW_STOCK_THRESHOLD}
        ORDER BY sellable ASC, p.name ASC
        LIMIT ${lowStockLimit}`),
    ]);
    const t = totals[0] ?? {};
    const s = stockCounts[0] ?? {};
    return {
      units: num(t.units),
      weightGrams: num(t.weight),
      valueAtCostPaise: num(t.cost_value),
      retailValuePaise: num(t.retail),
      unitsWithCost: num(t.units_with_cost),
      lowStockSkus: num(s.low),
      outOfStockSkus: num(s.oos),
      byCategory: byCategory.map((c) => ({
        categoryId: String(c.category_id),
        name: String(c.name),
        units: num(c.units),
        weightGrams: num(c.weight),
        valueAtCostPaise: num(c.cost_value),
      })),
      lowStock: lowStock.map((l) => ({
        variantId: String(l.variant_id),
        productId: String(l.product_id),
        productName: String(l.product_name),
        sku: String(l.sku),
        color: String(l.color),
        size: String(l.size),
        sellable: num(l.sellable),
        weightGrams: num(l.weight),
        valueAtCostPaise: l.cost_value == null ? null : num(l.cost_value),
      })),
    };
  }

  async getCustomers(w: DashboardWindow): Promise<CustomerAggregate> {
    const [buyers, registrations] = await Promise.all([
      prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
        WITH ${REALIZED},
        keyed AS (SELECT COALESCE("userId", email) AS cust, realized_at FROM realized),
        in_window AS (
          SELECT cust, COUNT(*) AS n FROM keyed WHERE ${inWindow(Prisma.sql`realized_at`, w)} GROUP BY cust
        ),
        firsts AS (SELECT cust, MIN(realized_at) AS first_at FROM keyed GROUP BY cust)
        SELECT COUNT(*)::float8 AS buyers,
               COUNT(*) FILTER (WHERE f.first_at >= ${w.start} AND f.first_at < ${w.end})::float8 AS new_buyers,
               COUNT(*) FILTER (WHERE iw.n >= 2)::float8 AS repeat_buyers
        FROM in_window iw JOIN firsts f ON f.cust = iw.cust`),
      prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
        SELECT COUNT(*)::float8 AS n FROM users WHERE role = 'CUSTOMER' AND ${inWindow(Prisma.sql`"createdAt"`, w)}`),
    ]);
    const b = buyers[0] ?? {};
    return {
      buyers: num(b.buyers),
      newBuyers: num(b.new_buyers),
      repeatBuyers: num(b.repeat_buyers),
      newRegistrations: num(registrations[0]?.n),
    };
  }

  async getFunnel(w: DashboardWindow): Promise<FunnelAggregate> {
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      WITH cohort AS (
        SELECT "sessionId" FROM analytics_events
        WHERE type = 'SESSION_STARTED' AND ${inWindow(Prisma.sql`"createdAt"`, w)}
      ),
      flags AS (
        SELECT c."sessionId",
          EXISTS (SELECT 1 FROM analytics_events e WHERE e."sessionId" = c."sessionId" AND e.type = 'PRODUCT_VIEWED') AS viewed,
          EXISTS (SELECT 1 FROM analytics_events e WHERE e."sessionId" = c."sessionId" AND e.type = 'CART_ADDED') AS carted,
          EXISTS (SELECT 1 FROM analytics_events e WHERE e."sessionId" = c."sessionId" AND e.type = 'CHECKOUT_STARTED') AS checkout,
          EXISTS (SELECT 1 FROM orders o WHERE o."analyticsSessionId" = c."sessionId"
                    AND o.status NOT IN ('PENDING_PAYMENT', 'PAYMENT_FAILED', 'CANCELLED')) AS ordered
        FROM cohort c
      )
      SELECT COUNT(*)::float8 AS sessions,
             COUNT(*) FILTER (WHERE viewed)::float8 AS views,
             COUNT(*) FILTER (WHERE viewed AND carted)::float8 AS carts,
             COUNT(*) FILTER (WHERE viewed AND carted AND checkout)::float8 AS checkouts,
             COUNT(*) FILTER (WHERE viewed AND carted AND checkout AND ordered)::float8 AS orders
      FROM flags`);
    const r = rows[0] ?? {};
    return {
      sessions: num(r.sessions),
      productViews: num(r.views),
      addToCart: num(r.carts),
      checkout: num(r.checkouts),
      paidOrders: num(r.orders),
    };
  }

  async getAbandonedCarts(w: DashboardWindow, cutoff: Date): Promise<AbandonedCartAggregate> {
    // Idle-since window is [start, min(end, cutoff)) so a cart touched an hour ago is never "abandoned" yet.
    const idleEnd = new Date(Math.min(w.end.getTime(), cutoff.getTime()));
    const [carts, orders] = await Promise.all([
      prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
        WITH activity AS (
          SELECT c.id,
                 GREATEST(c."updatedAt", MAX(ci."updatedAt")) AS last_at,
                 SUM(ci.quantity * v."effectivePricePaiseCache")::float8 AS value
          FROM carts c
          JOIN cart_items ci ON ci."cartId" = c.id
          JOIN product_variants v ON v.id = ci."variantId"
          WHERE c.status IN ('ACTIVE', 'ABANDONED')
          GROUP BY c.id
        )
        SELECT COUNT(*)::float8 AS abandoned, COALESCE(SUM(value), 0)::float8 AS value
        FROM activity WHERE last_at >= ${w.start} AND last_at < ${idleEnd}`),
      prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
        SELECT COUNT(*)::float8 AS n FROM orders
        WHERE ${inWindow(Prisma.sql`"placedAt"`, w)} AND status NOT IN ('PENDING_PAYMENT', 'PAYMENT_FAILED', 'CANCELLED')`),
    ]);
    return {
      abandoned: num(carts[0]?.abandoned),
      estimatedValuePaise: num(carts[0]?.value),
      ordersPlaced: num(orders[0]?.n),
    };
  }
}
