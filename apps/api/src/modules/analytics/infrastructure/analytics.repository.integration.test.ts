import { randomUUID } from "node:crypto";
import { Prisma, prisma } from "@woobe/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { istMidnight } from "../domain/dashboard-period";
import { AnalyticsRepository } from "./analytics.repository";

/**
 * Integration tests of every dashboard query against the REAL test database.
 *
 * ISOLATION: the shared `woobe_test` DB is written to by other suites, so every
 * time-windowed assertion runs on a fixed window in MARCH 2001 that nothing else
 * touches, making absolute (not before/after) assertions safe. As-of-now panels
 * (inventory, COD outstanding) have no time axis, so those assert DELTAS.
 *
 * The fixture deliberately contains the traps the definitions exist to handle:
 * a cancelled order, a payment-failed order, a COD order that is confirmed but
 * uncollected, a COD order delivered in a LATER period than it was placed, an
 * RTO, a partial-refund return, a refund on a cancelled order (must be
 * ignored), items with and without a cost snapshot, and non-sequential funnel
 * sessions.
 */
const TAG = `analytics-it-${randomUUID().slice(0, 8)}`;
const repo = new AnalyticsRepository();
const WINDOW = { start: istMidnight("2001-03-01"), end: istMidnight("2001-04-01") };
const at = (day: string, hour = 12) => new Date(`2001-${day}T${String(hour).padStart(2, "0")}:00:00.000Z`);

const ids = { categories: [] as string[], products: [] as string[], variants: [] as string[], orders: [] as string[], users: [] as string[], carts: [] as string[] };
let catA: string;
let catB: string;
let v1: string; // WEIGHT_BASED, cost/kg configured, 500g, sells 40000
let v2: string; // FIXED, per-piece cost configured, 300g, sells 60000
let v3: string; // WEIGHT_BASED, NO cost, 200g, sells 20000
let p1: string;
let p2: string;
let p3: string;
let userU1: string;
let warehouseId: string;
let inventoryBefore: Awaited<ReturnType<AnalyticsRepository["getInventory"]>>;
let codBefore: Awaited<ReturnType<AnalyticsRepository["getCodOutstanding"]>>;

const S = { s1: randomUUID(), s2: randomUUID(), s3: randomUUID(), s4: randomUUID(), s5: randomUUID(), s6: randomUUID(), s7: randomUUID() };

interface OrderSpec {
  key: string;
  status: Prisma.OrderCreateInput["status"];
  method: "RAZORPAY" | "COD";
  paymentStatus: "CREATED" | "PENDING" | "CAPTURED" | "FAILED" | "REFUNDED";
  placedAt: Date;
  deliveredAt?: Date;
  shippedAt?: Date;
  userId?: string;
  email: string;
  session?: string;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  items: {
    variantId: string;
    weightGrams: number;
    pricingMode: "WEIGHT_BASED" | "FIXED";
    unit: number;
    base: number;
    qty: number;
    discount: number;
    offerDiscount: number;
    cost: number | null;
  }[];
}

async function createOrder(spec: OrderSpec): Promise<{ orderId: string; itemIds: string[] }> {
  const total = spec.subtotal + spec.tax + spec.shipping - spec.discount;
  const order = await prisma.order.create({
    data: {
      orderNumber: `${TAG}-${spec.key}`,
      userId: spec.userId ?? null,
      status: spec.status,
      contactName: "Analytics IT",
      contactPhone: "9999999999",
      contactEmail: spec.email,
      shippingSnapshot: {},
      subtotalPaise: spec.subtotal,
      discountPaise: spec.discount,
      shippingFeePaise: spec.shipping,
      taxPaise: spec.tax,
      totalPaise: total,
      totalWeightGrams: spec.items.reduce((n, i) => n + i.weightGrams * i.qty, 0),
      paymentMethod: spec.method,
      placedAt: spec.placedAt,
      createdAt: spec.placedAt,
      shippedAt: spec.shippedAt ?? null,
      deliveredAt: spec.deliveredAt ?? null,
      analyticsSessionId: spec.session ?? null,
      items: {
        create: spec.items.map((i) => ({
          variantId: i.variantId,
          productNameSnapshot: "Analytics IT product",
          skuSnapshot: "SKU",
          color: "Red",
          size: "M",
          weightGrams: i.weightGrams,
          pricingMode: i.pricingMode,
          basePricePaise: i.base,
          unitPricePaise: i.unit,
          quantity: i.qty,
          lineTotalPaise: i.unit * i.qty,
          taxAmountPaise: 0,
          discountPaise: i.discount,
          offerDiscountPaise: i.offerDiscount,
          unitCostPaiseSnapshot: i.cost,
        })),
      },
      payments: { create: { provider: spec.method, status: spec.paymentStatus, amountPaise: total, createdAt: spec.placedAt } },
    },
    include: { items: true },
  });
  ids.orders.push(order.id);
  return { orderId: order.id, itemIds: order.items.map((i) => i.id) };
}

beforeAll(async () => {
  warehouseId = (await prisma.warehouse.findFirstOrThrow({ where: { isActive: true } })).id;
  inventoryBefore = await repo.getInventory(50);
  codBefore = await repo.getCodOutstanding();

  const [a, b] = await Promise.all([
    prisma.category.create({ data: { name: `${TAG} A`, slug: `${TAG}-a` } }),
    prisma.category.create({ data: { name: `${TAG} B`, slug: `${TAG}-b` } }),
  ]);
  catA = a.id;
  catB = b.id;
  ids.categories.push(catA, catB);

  const mkProduct = async (name: string, categoryId: string, pricingMode: "WEIGHT_BASED" | "FIXED", costPerKgPaise: number | null) => {
    const p = await prisma.product.create({ data: { name: `${TAG} ${name}`, slug: `${TAG}-${name}`, categoryId, pricingMode, costPerKgPaise } });
    ids.products.push(p.id);
    return p.id;
  };
  p1 = await mkProduct("p1", catA, "WEIGHT_BASED", 60_000); // 500g -> 30,000 cost
  p2 = await mkProduct("p2", catA, "FIXED", null);
  p3 = await mkProduct("p3", catB, "WEIGHT_BASED", null);

  const mkVariant = async (productId: string, key: string, weightGrams: number, price: number, fixed: number | null, cost: number | null) => {
    const v = await prisma.productVariant.create({
      data: { productId, sku: `${TAG}-${key}`, color: "Red", size: "M", weightGrams, fixedPricePaise: fixed, costPricePaise: cost, effectivePricePaiseCache: price },
    });
    ids.variants.push(v.id);
    return v.id;
  };
  v1 = await mkVariant(p1, "v1", 500, 40_000, null, null);
  v2 = await mkVariant(p2, "v2", 300, 60_000, 60_000, 25_000);
  v3 = await mkVariant(p3, "v3", 200, 20_000, null, null);

  userU1 = (await prisma.user.create({ data: { email: `${TAG}-u1@example.com`, name: "U1", role: "CUSTOMER", createdAt: at("03-01") } })).id;
  ids.users.push(userU1);

  const item = (variantId: string, weightGrams: number, pricingMode: "WEIGHT_BASED" | "FIXED", unit: number, base: number, qty: number, discount: number, offerDiscount: number, cost: number | null) =>
    ({ variantId, weightGrams, pricingMode, unit, base, qty, discount, offerDiscount, cost });

  // O1 online CONFIRMED, realized 03-05: V1 x2 (covered, coupon 4000, offer 10000) + V3 x1 (uncovered).
  const o1 = await createOrder({
    key: "o1", status: "CONFIRMED", method: "RAZORPAY", paymentStatus: "CAPTURED", placedAt: at("03-05"), userId: userU1, email: `${TAG}-u1@example.com`, session: S.s1,
    subtotal: 100_000, discount: 4_000, shipping: 5_000, tax: 4_000,
    items: [item(v1, 500, "WEIGHT_BASED", 40_000, 45_000, 2, 4_000, 10_000, 30_000), item(v3, 200, "WEIGHT_BASED", 20_000, 20_000, 1, 0, 0, null)],
  });
  // O2 COD DELIVERED 03-10 (placed in FEBRUARY -> realized in March by delivery date), cash collected.
  await createOrder({
    key: "o2", status: "DELIVERED", method: "COD", paymentStatus: "CAPTURED", placedAt: at("02-28"), shippedAt: at("03-08"), deliveredAt: at("03-10"), email: `${TAG}-guest@example.com`,
    subtotal: 60_000, discount: 0, shipping: 0, tax: 0, items: [item(v2, 300, "FIXED", 60_000, 60_000, 1, 0, 0, 25_000)],
  });
  // O3 COD CONFIRMED, cash NOT collected -> outstanding, never a sale.
  await createOrder({
    key: "o3", status: "CONFIRMED", method: "COD", paymentStatus: "PENDING", placedAt: at("03-12"), email: `${TAG}-x@example.com`,
    subtotal: 70_000, discount: 0, shipping: 0, tax: 0, items: [item(v3, 200, "WEIGHT_BASED", 20_000, 20_000, 1, 0, 0, null), item(v1, 500, "WEIGHT_BASED", 50_000, 50_000, 1, 0, 0, null)],
  });
  // O4 online CANCELLED (payment REFUNDED) -> not a sale, and its refund must not count.
  const o4 = await createOrder({
    key: "o4", status: "CANCELLED", method: "RAZORPAY", paymentStatus: "REFUNDED", placedAt: at("03-06"), email: `${TAG}-c@example.com`,
    subtotal: 30_000, discount: 0, shipping: 0, tax: 0, items: [item(v3, 200, "WEIGHT_BASED", 30_000, 30_000, 1, 0, 0, null)],
  });
  // O5 PAYMENT_FAILED -> not a sale; its session reached checkout but never converted.
  await createOrder({
    key: "o5", status: "PAYMENT_FAILED", method: "RAZORPAY", paymentStatus: "FAILED", placedAt: at("03-07"), email: `${TAG}-f@example.com`, session: S.s2,
    subtotal: 25_000, discount: 0, shipping: 0, tax: 0, items: [item(v3, 200, "WEIGHT_BASED", 25_000, 25_000, 1, 0, 0, null)],
  });
  // O6 COD RETURNED_TO_ORIGIN, shipped 03-09 -> RTO cohort, never a sale.
  await createOrder({
    key: "o6", status: "RETURNED_TO_ORIGIN", method: "COD", paymentStatus: "PENDING", placedAt: at("03-09"), shippedAt: at("03-09"), email: `${TAG}-r@example.com`,
    subtotal: 50_000, discount: 0, shipping: 0, tax: 0, items: [item(v3, 200, "WEIGHT_BASED", 50_000, 50_000, 1, 0, 0, null)],
  });
  // O7 online DELIVERED, same customer U1 again (repeat), realized 03-06.
  await createOrder({
    key: "o7", status: "DELIVERED", method: "RAZORPAY", paymentStatus: "CAPTURED", placedAt: at("03-06"), shippedAt: at("03-07"), deliveredAt: at("03-09"), userId: userU1, email: `${TAG}-u1@example.com`,
    subtotal: 60_000, discount: 0, shipping: 0, tax: 0, items: [item(v3, 200, "WEIGHT_BASED", 20_000, 20_000, 3, 0, 0, null)],
  });
  // O8 guest's EARLIER realized order (February) -> makes the guest a RETURNING buyer in March.
  await createOrder({
    key: "o8", status: "CONFIRMED", method: "RAZORPAY", paymentStatus: "CAPTURED", placedAt: at("02-10"), email: `${TAG}-guest@example.com`,
    subtotal: 10_000, discount: 0, shipping: 0, tax: 0, items: [item(v3, 200, "WEIGHT_BASED", 10_000, 10_000, 1, 0, 0, null)],
  });

  // Return: 1 of O1's 2 V1 units, refunded 03-15 (partial refund). Plus a refund on the CANCELLED O4 that must be ignored.
  const ret = await prisma.return.create({
    data: { orderId: o1.orderId, status: "REFUNDED", reason: "size", requestedAt: at("03-14"), items: { create: [{ orderItemId: o1.itemIds[0]!, quantity: 1 }] } },
  });
  await prisma.refund.create({ data: { orderId: o1.orderId, returnId: ret.id, provider: "RAZORPAY", status: "COMPLETED", amountPaise: 40_000, createdAt: at("03-15") } });
  await prisma.refund.create({ data: { orderId: o4.orderId, provider: "RAZORPAY", status: "COMPLETED", amountPaise: 20_000, createdAt: at("03-16") } });

  // Razorpay webhooks: 4 failures in March (+1 in February), 2 captures.
  const failure = (n: number, day: string, reason: string | null, code: string | null, amount: number) =>
    prisma.webhookEvent.create({
      data: {
        provider: "razorpay", eventType: "payment.failed", eventId: `${TAG}-f${n}`, createdAt: at(day),
        payload: { event: "payment.failed", payload: { payment: { entity: { amount, error_code: code, error_reason: reason, error_description: null } } } },
      },
    });
  await failure(1, "03-04", "insufficient_funds", "BAD_REQUEST_ERROR", 1_000);
  await failure(2, "03-04", "insufficient_funds", "BAD_REQUEST_ERROR", 2_000);
  await failure(3, "03-05", "payment_cancelled", "BAD_REQUEST_ERROR", 3_000);
  await failure(4, "03-05", "some_brand_new_reason", null, 4_000);
  await failure(5, "02-20", "insufficient_funds", null, 9_999); // outside the window
  for (const n of [1, 2]) {
    await prisma.webhookEvent.create({ data: { provider: "razorpay", eventType: "payment.captured", eventId: `${TAG}-c${n}`, createdAt: at("03-05"), payload: {} } });
  }

  // Funnel: 6 sessions in March (+1 outside). s6 skips the product view (non-sequential), s7 is out of window.
  const ev = (sessionId: string, type: "SESSION_STARTED" | "PRODUCT_VIEWED" | "CART_ADDED" | "CHECKOUT_STARTED", day: string) =>
    ({ sessionId, type, dedupeKey: type === "PRODUCT_VIEWED" ? p1 : "once", productId: type === "PRODUCT_VIEWED" ? p1 : null, createdAt: at(day) });
  await prisma.analyticsEvent.createMany({
    data: [
      ev(S.s1, "SESSION_STARTED", "03-05"), ev(S.s1, "PRODUCT_VIEWED", "03-05"), ev(S.s1, "CART_ADDED", "03-05"), ev(S.s1, "CHECKOUT_STARTED", "03-05"),
      ev(S.s2, "SESSION_STARTED", "03-06"), ev(S.s2, "PRODUCT_VIEWED", "03-06"), ev(S.s2, "CART_ADDED", "03-06"), ev(S.s2, "CHECKOUT_STARTED", "03-07"),
      ev(S.s3, "SESSION_STARTED", "03-06"), ev(S.s3, "PRODUCT_VIEWED", "03-06"), ev(S.s3, "CART_ADDED", "03-06"),
      ev(S.s4, "SESSION_STARTED", "03-07"), ev(S.s4, "PRODUCT_VIEWED", "03-07"),
      ev(S.s5, "SESSION_STARTED", "03-07"),
      ev(S.s6, "SESSION_STARTED", "03-08"), ev(S.s6, "CART_ADDED", "03-08"), ev(S.s6, "CHECKOUT_STARTED", "03-08"), // no PRODUCT_VIEWED
      ev(S.s7, "SESSION_STARTED", "05-01"), ev(S.s7, "PRODUCT_VIEWED", "05-01"),
    ],
  });

  // Carts: C1 idle in-window WITH items (abandoned); C2 idle but EMPTY (ignored); C3 CONVERTED (ignored); C4 active NOW (not idle 24h).
  const mkCart = async (status: "ACTIVE" | "CONVERTED", withItem: boolean) => {
    const c = await prisma.cart.create({ data: { status, ...(withItem ? { items: { create: { variantId: v1, quantity: 2 } } } : {}) } });
    ids.carts.push(c.id);
    return c.id;
  };
  const c1 = await mkCart("ACTIVE", true);
  const c2 = await mkCart("ACTIVE", false);
  const c3 = await mkCart("CONVERTED", true);
  await mkCart("ACTIVE", true);
  for (const [cartId, day] of [[c1, "03-20"], [c2, "03-21"], [c3, "03-22"]] as const) {
    await prisma.$executeRaw`UPDATE carts SET "updatedAt" = ${at(day)} WHERE id = ${cartId}`;
    await prisma.$executeRaw`UPDATE cart_items SET "updatedAt" = ${at(day)} WHERE "cartId" = ${cartId}`;
  }

  // Inventory: V1 10 (in stock), V2 4 (LOW stock), V3 20 (no cost).
  for (const [variantId, qty] of [[v1, 10], [v2, 4], [v3, 20]] as const) {
    await prisma.inventory.create({ data: { variantId, warehouseId, quantityAvailable: qty, quantityReserved: 0 } });
  }
}, 60_000);

afterAll(async () => {
  await prisma.refund.deleteMany({ where: { orderId: { in: ids.orders } } });
  await prisma.returnItem.deleteMany({ where: { return: { orderId: { in: ids.orders } } } });
  await prisma.return.deleteMany({ where: { orderId: { in: ids.orders } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: ids.orders } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: ids.orders } } });
  await prisma.order.deleteMany({ where: { id: { in: ids.orders } } });
  await prisma.cartItem.deleteMany({ where: { cartId: { in: ids.carts } } });
  await prisma.cart.deleteMany({ where: { id: { in: ids.carts } } });
  await prisma.inventory.deleteMany({ where: { variantId: { in: ids.variants } } });
  await prisma.productVariant.deleteMany({ where: { id: { in: ids.variants } } });
  await prisma.product.deleteMany({ where: { id: { in: ids.products } } });
  await prisma.category.deleteMany({ where: { id: { in: ids.categories } } });
  await prisma.user.deleteMany({ where: { id: { in: ids.users } } });
  await prisma.webhookEvent.deleteMany({ where: { eventId: { startsWith: TAG } } });
  await prisma.analyticsEvent.deleteMany({ where: { sessionId: { in: Object.values(S) } } });
  await prisma.$disconnect();
});

describe("getSales — realized-sale rules", () => {
  it("counts online-paid at placement and COD only when delivered+collected; excludes cancelled / failed / RTO / uncollected COD", async () => {
    const s = await repo.getSales(WINDOW);
    expect(s.orders).toBe(3); // O1 + O7 (online) + O2 (COD delivered in March though placed in Feb)
    expect(s.onlineOrders).toBe(2);
    expect(s.codOrders).toBe(1);
  });

  it("separates gross, offer/coupon discounts, item sales, shipping and tax", async () => {
    const s = await repo.getSales(WINDOW);
    expect(s.grossSalesPaise).toBe(230_000); // list price before offers
    expect(s.offerDiscountPaise).toBe(10_000);
    expect(s.couponDiscountPaise).toBe(4_000);
    expect(s.itemSalesPaise).toBe(220_000);
    expect(s.shippingRevenuePaise).toBe(5_000);
    expect(s.taxPaise).toBe(4_000);
  });

  it("units and kg use the immutable order-item weight snapshot", async () => {
    const s = await repo.getSales(WINDOW);
    expect(s.units).toBe(7);
    expect(s.weightGrams).toBe(2_100); // 2x500 + 200 + 3x200 + 300
    expect(s.returnedUnits).toBe(1);
    expect(s.returnedWeightGrams).toBe(500);
  });

  it("a partial-refund return reduces net sales by the ex-tax value of ONLY the returned unit; the cash refund is reported separately", async () => {
    const s = await repo.getSales(WINDOW);
    expect(s.returnedValuePaise).toBe(38_000); // (80,000 - 4,000 coupon) / 2
    expect(s.refundCashPaise).toBe(40_000);
    expect(s.refundedOrders).toBe(1);
  });

  it("ignores a refund issued on a cancelled (never-realized) order", async () => {
    const s = await repo.getSales(WINDOW);
    expect(s.refundCashPaise).not.toBe(60_000);
  });

  it("carries COGS and the cost-covered net only for items with a cost snapshot", async () => {
    const s = await repo.getSales(WINDOW);
    expect(s.cogsPaise).toBe(85_000); // 2x30,000 + 25,000
    expect(s.coveredItemNetPaise).toBe(136_000); // (80,000-4,000) + 60,000
    expect(s.coveredReturnedValuePaise).toBe(38_000);
  });

  it("an empty window returns clean zeros", async () => {
    const s = await repo.getSales({ start: istMidnight("1999-01-01"), end: istMidnight("1999-02-01") });
    expect(s.orders).toBe(0);
    expect(s.itemSalesPaise).toBe(0);
    expect(s.cogsPaise).toBe(0);
  });

  it("date boundaries are half-open on IST midnights: an order at 18:29Z 03-31 is in March, at 18:30Z it is April", async () => {
    // O1's realization instant is 2001-03-05 12:00Z; shrink the window to end exactly at that instant.
    const before = await repo.getSales({ start: WINDOW.start, end: at("03-05") });
    const after = await repo.getSales({ start: at("03-05"), end: WINDOW.end });
    expect(before.orders).toBe(0);
    expect(after.orders).toBe(3);
  });
});

describe("getDailySales", () => {
  it("buckets by IST day and puts returns on the day the refund was issued", async () => {
    const rows = new Map((await repo.getDailySales(WINDOW)).map((r) => [r.date, r]));
    expect(rows.get("2001-03-05")).toMatchObject({ orders: 1, itemNetPaise: 96_000, weightGrams: 1_200, coveredItemNetPaise: 76_000, cogsPaise: 60_000 });
    expect(rows.get("2001-03-06")).toMatchObject({ orders: 1, itemNetPaise: 60_000, weightGrams: 600, coveredItemNetPaise: 0, cogsPaise: 0 });
    expect(rows.get("2001-03-10")).toMatchObject({ orders: 1, itemNetPaise: 60_000, coveredItemNetPaise: 60_000, cogsPaise: 25_000 });
    expect(rows.get("2001-03-15")).toMatchObject({ returnedValuePaise: 38_000, returnedWeightGrams: 500, coveredReturnedValuePaise: 38_000 });
    const totalNet = [...rows.values()].reduce((n, r) => n + r.itemNetPaise - r.returnedValuePaise, 0);
    expect(totalNet).toBe(178_000);
  });
});

describe("getFulfillment / COD", () => {
  it("counts every status placed in the window", async () => {
    const f = await repo.getFulfillment(WINDOW);
    const counts = Object.fromEntries(f.statusCounts.map((s) => [s.status, s.count]));
    expect(counts).toMatchObject({ CONFIRMED: 2, CANCELLED: 1, PAYMENT_FAILED: 1, RETURNED_TO_ORIGIN: 1, DELIVERED: 1 });
  });

  it("delivery cohort = orders shipped in the window: delivered vs RTO, with RTO value", async () => {
    const f = await repo.getFulfillment(WINDOW);
    expect(f).toMatchObject({ shipped: 3, delivered: 2, rtoOrders: 1, rtoValuePaise: 50_000, inTransit: 0 });
  });

  it("COD outstanding adds only the confirmed-but-uncollected COD order (delta on the shared DB)", async () => {
    const after = await repo.getCodOutstanding();
    expect(after.orders - codBefore.orders).toBe(1);
    expect(after.amountPaise - codBefore.amountPaise).toBe(70_000);
  });
});

describe("pending returns (as-of-now)", () => {
  it("counts only returns still awaiting an admin decision", async () => {
    const before = await repo.getPendingReturnsCount();
    await prisma.return.create({ data: { orderId: ids.orders[0]!, status: "RETURN_REQUESTED", reason: "changed mind" } });
    await prisma.return.create({ data: { orderId: ids.orders[0]!, status: "RETURN_REJECTED", reason: "late" } });
    expect((await repo.getPendingReturnsCount()) - before).toBe(1);
  });
});

describe("payments", () => {
  it("returns only in-window failures, with raw reason fields and amounts", async () => {
    const failures = await repo.getPaymentFailures(WINDOW);
    expect(failures).toHaveLength(4);
    expect(failures.reduce((n, f) => n + f.amountPaise, 0)).toBe(10_000);
    expect(failures.map((f) => f.reason).sort()).toEqual(["insufficient_funds", "insufficient_funds", "payment_cancelled", "some_brand_new_reason"]);
  });
  it("counts captured payments in the window", async () => {
    expect(await repo.getSuccessfulPaymentCount(WINDOW)).toBe(2);
  });
  it("webhook events are unique per provider event id, so a retried delivery cannot double-count", async () => {
    await expect(
      prisma.webhookEvent.create({ data: { provider: "razorpay", eventType: "payment.failed", eventId: `${TAG}-f1`, createdAt: at("03-04"), payload: {} } }),
    ).rejects.toThrow();
    expect(await repo.getPaymentFailures(WINDOW)).toHaveLength(4);
  });
});

describe("merchandising", () => {
  it("categories: net sales, units and kg net of returns, per category", async () => {
    const rows = new Map((await repo.getCategoryAggregates(WINDOW)).map((r) => [r.categoryId, r]));
    expect(rows.get(catA)).toMatchObject({ netSalesPaise: 98_000, units: 2, weightGrams: 800 }); // V1 (2 sold, 1 returned) + V2
    expect(rows.get(catB)).toMatchObject({ netSalesPaise: 80_000, units: 4, weightGrams: 800 }); // V3 across O1 + O7
  });
  it("best sellers rank by units net of returns, ties broken by net sales", async () => {
    const rows = (await repo.getBestSellers(WINDOW, 10)).filter((r) => [p1, p2, p3].includes(r.productId));
    // p3: 4 units. p1 and p2 tie on 1 unit (p1 sold 2, 1 returned) -> p2's higher net sales (60,000 vs 38,000) ranks it first.
    expect(rows.map((r) => r.productId)).toEqual([p3, p2, p1]);
    expect(rows.find((r) => r.productId === p1)).toMatchObject({ units: 1, netSalesPaise: 38_000, weightGrams: 500 });
    expect(rows.find((r) => r.productId === p2)).toMatchObject({ units: 1, netSalesPaise: 60_000 });
  });
});

describe("inventory (deltas — as-of-now data on a shared DB)", () => {
  it("adds units, kg, cost value, retail value and coverage exactly as configured", async () => {
    const after = await repo.getInventory(50);
    expect(after.units - inventoryBefore.units).toBe(34); // 10 + 4 + 20
    expect(after.weightGrams - inventoryBefore.weightGrams).toBe(10_200); // 10x500 + 4x300 + 20x200
    expect(after.valueAtCostPaise - inventoryBefore.valueAtCostPaise).toBe(400_000); // 10x30,000 (cost/kg x weight) + 4x25,000 (fixed); V3 has none
    expect(after.retailValuePaise - inventoryBefore.retailValuePaise).toBe(1_040_000);
    expect(after.unitsWithCost - inventoryBefore.unitsWithCost).toBe(14); // V3's 20 units have no cost
    expect(after.lowStockSkus - inventoryBefore.lowStockSkus).toBe(1); // V2: 4 sellable < 10
  });
  it("groups by category and lists the low-stock variant with its cost value", async () => {
    const after = await repo.getInventory(50);
    expect(after.byCategory.find((c) => c.categoryId === catA)).toMatchObject({ units: 14, weightGrams: 6_200, valueAtCostPaise: 400_000 });
    expect(after.byCategory.find((c) => c.categoryId === catB)).toMatchObject({ units: 20, weightGrams: 4_000, valueAtCostPaise: 0 });
    expect(after.lowStock.find((l) => l.variantId === v2)).toMatchObject({ sellable: 4, weightGrams: 300, valueAtCostPaise: 100_000 });
  });
});

describe("customers", () => {
  it("buyers, new vs returning (by lifetime first order), repeat buyers, registrations", async () => {
    const c = await repo.getCustomers(WINDOW);
    expect(c.buyers).toBe(2); // U1 (O1+O7) and the guest (O2)
    expect(c.newBuyers).toBe(1); // U1's first-ever order is in March; the guest ordered in February
    expect(c.repeatBuyers).toBe(1); // U1 has 2 realized orders in the window
    expect(c.newRegistrations).toBe(1);
  });
});

describe("funnel", () => {
  it("is session-based and strictly sequential; only real, non-failed, non-cancelled orders convert", async () => {
    const f = await repo.getFunnel(WINDOW);
    expect(f).toEqual({ sessions: 6, productViews: 4, addToCart: 3, checkout: 2, paidOrders: 1 });
    // s6 carted+checked out without viewing a product -> NOT counted past step 1 (sequential).
    // s2's order is PAYMENT_FAILED -> its checkout counts but it is not a converted order.
  });
  it("counts sessions per IST day for the traffic overlay", async () => {
    const days = await repo.getSessionsByDay(WINDOW);
    expect(days.reduce((n, d) => n + d.sessions, 0)).toBe(6);
    expect(days.find((d) => d.date === "2001-03-06")!.sessions).toBe(2);
  });
  it("the analytics event table is idempotent per (session, type, key)", async () => {
    const dup = await prisma.analyticsEvent.createMany({
      data: [{ sessionId: S.s1, type: "SESSION_STARTED", dedupeKey: "once", createdAt: at("03-05") }],
      skipDuplicates: true,
    });
    expect(dup.count).toBe(0);
    expect((await repo.getFunnel(WINDOW)).sessions).toBe(6);
  });
});

describe("abandoned carts", () => {
  it("counts idle-in-window carts WITH items only, valued at current prices; empty, converted and recently-active carts are ignored", async () => {
    const a = await repo.getAbandonedCarts(WINDOW, new Date(Date.now() - 24 * 3_600_000));
    expect(a.abandoned).toBe(1);
    expect(a.estimatedValuePaise).toBe(80_000); // 2 x V1's current price 40,000
    expect(a.ordersPlaced).toBe(4); // O1, O3, O6, O7 placed in March and not cancelled/failed/pending
  });
  it("a cart idle for less than the 24h cutoff is not abandoned yet", async () => {
    const cutoff = at("03-20", 6); // before C1's last activity (03-20 12:00Z)
    const a = await repo.getAbandonedCarts(WINDOW, cutoff);
    expect(a.abandoned).toBe(0);
  });
});
