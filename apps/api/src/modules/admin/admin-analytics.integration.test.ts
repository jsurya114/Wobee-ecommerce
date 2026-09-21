// apps/api/src/modules/admin/admin-analytics.integration.test.ts
import { randomUUID } from "node:crypto";
import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";
import { AnalyticsRepository } from "../analytics/infrastructure/analytics.repository";
import { istDateString, istMidnight } from "../analytics/domain/dashboard-period";

/**
 * Integration tests against the REAL test database — fixture helpers
 * copied from admin.integration.test.ts, same convention that file's own
 * comment documents (each integration file is self-contained). Covers the
 * business-analytics HTTP surface (2026-09-21): RBAC (super_admin only — see
 * permissions.ts's own VIEW_ANALYTICS comment), query validation, the
 * confidential product-cost endpoints, the public event collector, and — the
 * point of testing against a real DB — the COD lifecycle under the NEW
 * definitions: a confirmed COD order is "COD outstanding", NOT a sale, until
 * it is delivered and the cash collected; and order creation snapshots the
 * unit cost and the analytics session. SQL-level definitions are covered in
 * analytics.repository.integration.test.ts.
 *
 * Every assertion here is a BEFORE/AFTER delta, never an absolute figure —
 * this test file runs alongside a real, shared `woobe_test` database that
 * other suites also write orders into, so an absolute "total revenue is
 * exactly X" assertion would be flaky by construction.
 */

const TEST_PREFIX = "admin-analytics-integration";
const app = createApp();

let categoryId: string;
let warehouseId: string;
const createdProductIds: string[] = [];
const createdVariantIds: string[] = [];
const createdOrderIds: string[] = [];

beforeAll(async () => {
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  categoryId = category.id;
  const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { isActive: true } });
  warehouseId = warehouse.id;
});

afterAll(async () => {
  if (createdOrderIds.length > 0) {
    await prisma.adminAuditLog.deleteMany({ where: { entityId: { in: createdOrderIds } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: createdOrderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  }
  if (createdVariantIds.length > 0) {
    await prisma.cartItem.deleteMany({ where: { variantId: { in: createdVariantIds } } });
    await prisma.productVariant.deleteMany({ where: { id: { in: createdVariantIds } } });
  }
  if (createdProductIds.length > 0) {
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
  }
  await prisma.$disconnect();
});

async function createTestVariant(quantityAvailable: number): Promise<{ variantId: string; productId: string }> {
  const suffix = randomUUID().slice(0, 8);
  const product = await prisma.product.create({
    data: { name: `${TEST_PREFIX} Product ${suffix}`, slug: `${TEST_PREFIX}-${suffix}`, categoryId, isActive: true },
  });
  createdProductIds.push(product.id);

  const variant = await prisma.productVariant.create({
    data: { productId: product.id, sku: `${TEST_PREFIX}-${suffix}`, color: "Black", size: "M", weightGrams: 1200, isActive: true },
  });
  createdVariantIds.push(variant.id);

  await prisma.inventory.create({ data: { variantId: variant.id, warehouseId, quantityAvailable, quantityReserved: 0 } });
  return { variantId: variant.id, productId: product.id };
}

const checkoutAddress = {
  fullName: "Test Buyer",
  phone: "9876543210",
  line1: "123 Test Street",
  city: "Bengaluru",
  state: "Karnataka",
  pincode: "560001",
};

/** Checks out COD and confirms it immediately — same as admin.integration.test.ts's own helper. */
async function createConfirmedCodOrder(variantId: string, sessionHeader?: string) {
  const agent = request.agent(app);
  await agent.post("/api/v1/cart/items").send({ variantId, quantity: 1 });
  const checkoutReq = agent.post("/api/v1/orders/checkout");
  if (sessionHeader) checkoutReq.set("X-Woobe-Session", sessionHeader);
  const checkoutRes = await checkoutReq.send({
    contactEmail: "buyer@test.woobe.internal",
    confirmEmail: "buyer@test.woobe.internal",
    address: checkoutAddress,
    paymentMethod: "COD",
  });
  expect(checkoutRes.status).toBe(201);
  createdOrderIds.push(checkoutRes.body.id);
  const confirmRes = await agent.post("/api/v1/payments/cod/confirm").send({ orderId: checkoutRes.body.id });
  expect(confirmRes.status).toBe(200);
  return checkoutRes.body as { id: string; totalPaise: number; subtotalPaise: number; discountPaise: number };
}

async function loginAdmin(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/v1/admin/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

const repo = new AnalyticsRepository();
const TEST_SESSION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const todayWindow = () => {
  const start = istMidnight(istDateString(new Date()));
  return { start, end: new Date(start.getTime() + 24 * 3_600_000) };
};

describe("dashboard endpoint: RBAC and validation", () => {
  it("401s an anonymous caller", async () => {
    expect((await request(app).get("/api/v1/admin/analytics/dashboard")).status).toBe(401);
  });

  it("allows super_admin and returns the typed, grouped payload", async () => {
    const token = await loginAdmin("admin@woobe.in", "Admin@12345");
    const res = await request(app).get("/api/v1/admin/analytics/dashboard?range=7d&compare=previous").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(
      ["abandonedCarts", "customers", "fulfillment", "funnel", "inventory", "merchandising", "overview", "payments", "period", "sales"].sort(),
    );
    expect(res.body.period).toMatchObject({ range: "7d", compare: "previous", bucket: "day", timezone: "Asia/Kolkata" });
    expect(res.body.period.current.days).toBe(7);
    expect(res.body.sales.series).toHaveLength(7);
    expect(JSON.stringify(res.body)).not.toMatch(/NaN|Infinity/);
  });

  it("defaults to the last 30 days, compared with the previous period", async () => {
    const token = await loginAdmin("admin@woobe.in", "Admin@12345");
    const res = await request(app).get("/api/v1/admin/analytics/dashboard").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.period).toMatchObject({ range: "30d", compare: "previous" });
    expect(res.body.period.current.days).toBe(30);
    expect(res.body.period.previous).not.toBeNull();
  });

  it("compare=none returns no previous period and no deltas", async () => {
    const token = await loginAdmin("admin@woobe.in", "Admin@12345");
    const res = await request(app).get("/api/v1/admin/analytics/dashboard?range=30d&compare=none").set("Authorization", `Bearer ${token}`);
    expect(res.body.period.previous).toBeNull();
    expect(res.body.overview.netSales.deltaPct).toBeNull();
    expect(res.body.overview.netSales.previous).toBeNull();
  });

  it.each([
    ["an unknown range", "range=fortnight"],
    ["a custom range with no dates", "range=custom"],
    ["an inverted custom range", "range=custom&from=2026-09-10&to=2026-09-01"],
    ["a malformed date", "range=custom&from=yesterday&to=today"],
    ["a custom range over a year", "range=custom&from=2024-01-01&to=2026-01-01"],
  ])("400s %s", async (_label, query) => {
    const token = await loginAdmin("admin@woobe.in", "Admin@12345");
    const res = await request(app).get(`/api/v1/admin/analytics/dashboard?${query}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it("403s order_processing_staff — VIEW_ANALYTICS is super_admin only", async () => {
    const token = await loginAdmin("orders@woobe.in", "Staff@12345");
    expect((await request(app).get("/api/v1/admin/analytics/dashboard").set("Authorization", `Bearer ${token}`)).status).toBe(403);
  });

  it("403s product_management_staff — VIEW_ANALYTICS is super_admin only", async () => {
    const token = await loginAdmin("catalog@woobe.in", "Staff@12345");
    expect((await request(app).get("/api/v1/admin/analytics/dashboard").set("Authorization", `Bearer ${token}`)).status).toBe(403);
  });
});

describe("product cost endpoints are confidential", () => {
  it("403s catalog staff (they can manage the catalog, but cost is super_admin-only), 401s anonymous", async () => {
    const { productId } = await createTestVariant(1);
    const staff = await loginAdmin("catalog@woobe.in", "Staff@12345");
    expect((await request(app).get(`/api/v1/admin/products/${productId}/costs`).set("Authorization", `Bearer ${staff}`)).status).toBe(403);
    expect((await request(app).put(`/api/v1/admin/products/${productId}/costs`).set("Authorization", `Bearer ${staff}`).send({ costPerKgPaise: 1 })).status).toBe(403);
    expect((await request(app).get(`/api/v1/admin/products/${productId}/costs`)).status).toBe(401);
  });

  it("super_admin can set and read costs; nulls clear; a cost never appears on the PUBLIC product response", async () => {
    const { productId, variantId } = await createTestVariant(1);
    const token = await loginAdmin("admin@woobe.in", "Admin@12345");
    const auth = { Authorization: `Bearer ${token}` };

    const put = await request(app).put(`/api/v1/admin/products/${productId}/costs`).set(auth).send({ costPerKgPaise: 45_000, variantCosts: [{ variantId, costPricePaise: 9_000 }] });
    expect(put.status).toBe(200);
    expect(put.body.costs).toMatchObject({ productId, costPerKgPaise: 45_000 });
    expect(put.body.costs.variants[0]).toMatchObject({ variantId, costPricePaise: 9_000 });

    const cleared = await request(app).put(`/api/v1/admin/products/${productId}/costs`).set(auth).send({ costPerKgPaise: null });
    expect(cleared.body.costs.costPerKgPaise).toBeNull();
    expect(cleared.body.costs.variants[0].costPricePaise).toBe(9_000); // untouched: only present fields apply

    await request(app).put(`/api/v1/admin/products/${productId}/costs`).set(auth).send({ costPerKgPaise: 45_000 });
    const slug = (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).slug;
    const publicRes = await request(app).get(`/api/v1/products/${slug}`);
    expect(publicRes.status).toBe(200);
    expect(JSON.stringify(publicRes.body)).not.toMatch(/costPerKg|costPrice|unitCost/i);
  });

  it("rejects negative or malformed costs and 404s an unknown product", async () => {
    const token = await loginAdmin("admin@woobe.in", "Admin@12345");
    const auth = { Authorization: `Bearer ${token}` };
    const { productId } = await createTestVariant(1);
    expect((await request(app).put(`/api/v1/admin/products/${productId}/costs`).set(auth).send({ costPerKgPaise: -1 })).status).toBe(400);
    expect((await request(app).put(`/api/v1/admin/products/${productId}/costs`).set(auth).send({ variantCosts: [{ variantId: "nope", costPricePaise: 1 }] })).status).toBe(400);
    expect((await request(app).put(`/api/v1/admin/products/${randomUUID()}/costs`).set(auth).send({ costPerKgPaise: 1 })).status).toBe(404);
  });
});

describe("public analytics event collector", () => {
  const session = randomUUID();
  const productId = randomUUID();

  it("accepts each closed event type with 204 and is idempotent", async () => {
    for (const body of [
      { type: "SESSION_STARTED", sessionId: session },
      { type: "PRODUCT_VIEWED", sessionId: session, productId },
      { type: "CART_ADDED", sessionId: session },
      { type: "CHECKOUT_STARTED", sessionId: session },
    ]) {
      expect((await request(app).post("/api/v1/analytics/events").send(body)).status).toBe(204);
    }
    // Re-fire everything: no new rows.
    for (const body of [{ type: "SESSION_STARTED", sessionId: session }, { type: "PRODUCT_VIEWED", sessionId: session, productId }]) {
      expect((await request(app).post("/api/v1/analytics/events").send(body)).status).toBe(204);
    }
    expect(await prisma.analyticsEvent.count({ where: { sessionId: session } })).toBe(4);
    await prisma.analyticsEvent.deleteMany({ where: { sessionId: session } });
  });

  it("rejects anything outside the closed vocabulary or shape", async () => {
    const bad = [
      { type: "PURCHASE", sessionId: session },
      { type: "ORDER_PAID", sessionId: session }, // derived from orders, never client-reported
      { type: "SESSION_STARTED", sessionId: "not-a-uuid" },
      { type: "SESSION_STARTED" },
      { type: "PRODUCT_VIEWED", sessionId: session }, // needs a productId
      { type: "SESSION_STARTED", sessionId: session, email: "a@b.c" }, // no extra (PII) fields
    ];
    for (const body of bad) {
      expect((await request(app).post("/api/v1/analytics/events").send(body)).status).toBe(400);
    }
    expect(await prisma.analyticsEvent.count({ where: { sessionId: session } })).toBe(0);
  });

  it("attaches the user id only when signed in, and never stores anything else personal", async () => {
    const token = await loginAdmin("admin@woobe.in", "Admin@12345");
    const s = randomUUID();
    await request(app).post("/api/v1/analytics/events").set("Authorization", `Bearer ${token}`).send({ type: "SESSION_STARTED", sessionId: s });
    const row = await prisma.analyticsEvent.findFirstOrThrow({ where: { sessionId: s } });
    expect(row.userId).not.toBeNull();
    const anon = randomUUID();
    await request(app).post("/api/v1/analytics/events").send({ type: "SESSION_STARTED", sessionId: anon });
    expect((await prisma.analyticsEvent.findFirstOrThrow({ where: { sessionId: anon } })).userId).toBeNull();
    await prisma.analyticsEvent.deleteMany({ where: { sessionId: { in: [s, anon] } } });
  });
});

describe("COD lifecycle under the business-analytics definitions", () => {
  it("a confirmed COD order is COD-outstanding and NOT a sale; delivery + cash collection realizes it; cost and session are snapshotted", async () => {
    const { variantId, productId } = await createTestVariant(3);
    const token = await loginAdmin("admin@woobe.in", "Admin@12345");
    // WEIGHT_BASED product, variant weight 1200g: cost/kg 50,000 -> 60,000 per unit.
    await request(app).put(`/api/v1/admin/products/${productId}/costs`).set("Authorization", `Bearer ${token}`).send({ costPerKgPaise: 50_000 });

    const salesBefore = await repo.getSales(todayWindow());
    const codBefore = await repo.getCodOutstanding();

    const order = await createConfirmedCodOrder(variantId, TEST_SESSION);
    const subtotalNet = order.subtotalPaise - order.discountPaise;

    // Snapshots taken at order creation.
    const item = await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
    expect(item.unitCostPaiseSnapshot).toBe(60_000);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).analyticsSessionId).toBe(TEST_SESSION);

    const afterConfirm = { sales: await repo.getSales(todayWindow()), cod: await repo.getCodOutstanding() };
    // Not a sale yet — cash not collected.
    expect(afterConfirm.sales.orders - salesBefore.orders).toBe(0);
    expect(afterConfirm.sales.itemSalesPaise - salesBefore.itemSalesPaise).toBe(0);
    // ...but it is money owed.
    expect(afterConfirm.cod.orders - codBefore.orders).toBe(1);
    expect(afterConfirm.cod.amountPaise - codBefore.amountPaise).toBe(order.totalPaise);

    const staffToken = await loginAdmin("orders@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${staffToken}` };
    await request(app).post(`/api/v1/admin/orders/${order.id}/processing`).set(auth);
    await request(app).post(`/api/v1/admin/orders/${order.id}/packed`).set(auth);
    await request(app).post(`/api/v1/admin/orders/${order.id}/ship`).set(auth).send({ trackingNumber: "TRK1", carrier: "BlueDart" });
    await request(app).post(`/api/v1/admin/orders/${order.id}/deliver`).set(auth);

    const afterDelivery = { sales: await repo.getSales(todayWindow()), cod: await repo.getCodOutstanding() };
    expect(afterDelivery.sales.orders - salesBefore.orders).toBe(1);
    expect(afterDelivery.sales.codOrders - salesBefore.codOrders).toBe(1);
    expect(afterDelivery.sales.itemSalesPaise - salesBefore.itemSalesPaise).toBe(order.subtotalPaise);
    expect(afterDelivery.sales.weightGrams - salesBefore.weightGrams).toBe(1_200);
    expect(afterDelivery.sales.cogsPaise - salesBefore.cogsPaise).toBe(60_000);
    expect(afterDelivery.sales.coveredItemNetPaise - salesBefore.coveredItemNetPaise).toBe(subtotalNet);
    // Collected: no longer outstanding.
    expect(afterDelivery.cod.orders - codBefore.orders).toBe(0);
    expect(afterDelivery.cod.amountPaise - codBefore.amountPaise).toBe(0);
  });

  it("a later cost edit never rewrites an existing order's snapshot", async () => {
    const { variantId, productId } = await createTestVariant(3);
    const token = await loginAdmin("admin@woobe.in", "Admin@12345");
    const auth = { Authorization: `Bearer ${token}` };
    await request(app).put(`/api/v1/admin/products/${productId}/costs`).set(auth).send({ costPerKgPaise: 10_000 });
    const order = await createConfirmedCodOrder(variantId);
    await request(app).put(`/api/v1/admin/products/${productId}/costs`).set(auth).send({ costPerKgPaise: 99_000 });
    expect((await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } })).unitCostPaiseSnapshot).toBe(12_000);
  });

  it("an order with no cost configured snapshots null (unknown), never 0", async () => {
    const { variantId } = await createTestVariant(3);
    const order = await createConfirmedCodOrder(variantId);
    expect((await prisma.orderItem.findFirstOrThrow({ where: { orderId: order.id } })).unitCostPaiseSnapshot).toBeNull();
  });

  it("ignores a malformed session header instead of failing checkout", async () => {
    const { variantId } = await createTestVariant(3);
    const order = await createConfirmedCodOrder(variantId, "not-a-uuid");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).analyticsSessionId).toBeNull();
  });
});
