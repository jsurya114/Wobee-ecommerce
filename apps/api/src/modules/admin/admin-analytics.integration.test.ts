// apps/api/src/modules/admin/admin-analytics.integration.test.ts
import { randomUUID } from "node:crypto";
import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

/**
 * Integration tests against the REAL test database — fixture helpers
 * copied from admin.integration.test.ts, same convention that file's own
 * comment documents (each integration file is self-contained). Covers the
 * admin analytics dashboard (client-review request, 2026-09-03): RBAC
 * (super_admin only — see permissions.ts's own VIEW_ANALYTICS comment),
 * and — the actual point of testing this against a real DB rather than
 * mocks — that the COD payment-status fix (ConfirmCodOrderUseCase /
 * DeliverOrderAndCapturePaymentUseCase) is correctly reflected in the
 * dashboard's collected-vs-pending split, not just in the Payment table
 * directly.
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

async function createTestVariant(quantityAvailable: number): Promise<{ variantId: string }> {
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
  return { variantId: variant.id };
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
async function createConfirmedCodOrder(variantId: string) {
  const agent = request.agent(app);
  await agent.post("/api/v1/cart/items").send({ variantId, quantity: 1 });
  const checkoutRes = await agent.post("/api/v1/orders/checkout").send({
    contactEmail: "buyer@test.woobe.internal",
    confirmEmail: "buyer@test.woobe.internal",
    address: checkoutAddress,
    paymentMethod: "COD",
  });
  expect(checkoutRes.status).toBe(201);
  createdOrderIds.push(checkoutRes.body.id);
  const confirmRes = await agent.post("/api/v1/payments/cod/confirm").send({ orderId: checkoutRes.body.id });
  expect(confirmRes.status).toBe(200);
  return checkoutRes.body as { id: string; totalPaise: number };
}

async function loginAdmin(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/v1/admin/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

async function getDashboard(accessToken: string) {
  const res = await request(app).get("/api/v1/admin/analytics/dashboard").set("Authorization", `Bearer ${accessToken}`);
  expect(res.status).toBe(200);
  return res.body as {
    revenue: { totalRevenuePaise: number; orderCount: number; collectedPaise: number; pendingCodPaise: number };
  };
}

describe("admin analytics: RBAC", () => {
  it("allows super_admin", async () => {
    const token = await loginAdmin("admin@woobe.in", "Admin@12345");
    const res = await request(app).get("/api/v1/admin/analytics/dashboard").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it("403s order_processing_staff — VIEW_ANALYTICS is super_admin only", async () => {
    const token = await loginAdmin("orders@woobe.in", "Staff@12345");
    const res = await request(app).get("/api/v1/admin/analytics/dashboard").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("403s product_management_staff — VIEW_ANALYTICS is super_admin only", async () => {
    const token = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const res = await request(app).get("/api/v1/admin/analytics/dashboard").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe("admin analytics: COD payment-status fix reflected in collected-vs-pending revenue (client-review fix, 2026-09-03)", () => {
  it("counts a just-confirmed COD order as pending, not collected — then flips to collected on delivery", async () => {
    const token = await loginAdmin("admin@woobe.in", "Admin@12345");
    const before = await getDashboard(token);

    const { variantId } = await createTestVariant(3);
    const order = await createConfirmedCodOrder(variantId);

    const afterConfirm = await getDashboard(token);
    // Total revenue recognizes the sale immediately (the order IS confirmed) ...
    expect(afterConfirm.revenue.totalRevenuePaise - before.revenue.totalRevenuePaise).toBe(order.totalPaise);
    expect(afterConfirm.revenue.orderCount - before.revenue.orderCount).toBe(1);
    // ... but it must show as OWED, not IN HAND — this is exactly the bug that was fixed.
    expect(afterConfirm.revenue.pendingCodPaise - before.revenue.pendingCodPaise).toBe(order.totalPaise);
    expect(afterConfirm.revenue.collectedPaise - before.revenue.collectedPaise).toBe(0);

    // Walk it to DELIVERED (staff role — same permission set as MANAGE_ORDERS).
    const staffToken = await loginAdmin("orders@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${staffToken}` };
    await request(app).post(`/api/v1/admin/orders/${order.id}/processing`).set(auth);
    await request(app).post(`/api/v1/admin/orders/${order.id}/ship`).set(auth).send({ trackingNumber: "TRK1", carrier: "BlueDart" });
    await request(app).post(`/api/v1/admin/orders/${order.id}/deliver`).set(auth);

    const afterDelivery = await getDashboard(token);
    // Now the cash has actually changed hands: collected goes up, pending comes back down by the same amount.
    expect(afterDelivery.revenue.collectedPaise - afterConfirm.revenue.collectedPaise).toBe(order.totalPaise);
    expect(afterConfirm.revenue.pendingCodPaise - afterDelivery.revenue.pendingCodPaise).toBe(order.totalPaise);
    // Total revenue is unchanged by delivery — the sale was already recognized at confirm time.
    expect(afterDelivery.revenue.totalRevenuePaise).toBe(afterConfirm.revenue.totalRevenuePaise);
  });
});
