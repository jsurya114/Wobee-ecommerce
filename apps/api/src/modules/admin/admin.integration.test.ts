// apps/api/src/modules/admin/admin.integration.test.ts
import { randomUUID, createHmac } from "node:crypto";
import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

/**
 * Integration tests against the REAL test database — same conventions as
 * orders.integration.test.ts/payments.integration.test.ts (fixture helpers
 * copied from there, not reinvented). Covers ADR-025's "Done when" bar:
 * a CUSTOMER can't log into admin, RBAC actually 403s the wrong staff
 * role, the full order lifecycle writes an AdminAuditLog row per
 * transition, and cancellation triggers (or honestly fails to trigger,
 * per today's unconfigured Razorpay keys) a refund.
 */

const TEST_PREFIX = "admin-order-view-integration";
const WEBHOOK_SECRET = "test-webhook-secret"; // matches vitest.config.ts
const app = createApp();

/**
 * Normalizes the `set-cookie` response header into an array. Under this
 * workspace's installed `@types/superagent`, `res.headers["set-cookie"]`
 * types as `string | never[]` (sometimes just `string`), not `string[]` —
 * even though at runtime Express/Node genuinely sends it as an array when
 * there are multiple Set-Cookie headers. Same defensive-narrowing
 * convention as auth.integration.test.ts's `extractCookieHeader`.
 */
function setCookieArray(header: string | string[] | undefined): string[] {
  if (!header) return [];
  return Array.isArray(header) ? header : [header];
}

let categoryId: string;
let warehouseId: string;
const createdProductIds: string[] = [];
const createdVariantIds: string[] = [];
const createdOrderIds: string[] = [];
const createdCustomerEmails: string[] = [];

beforeAll(async () => {
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  categoryId = category.id;
  const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { isActive: true } });
  warehouseId = warehouse.id;
});

afterAll(async () => {
  if (createdOrderIds.length > 0) {
    await prisma.adminAuditLog.deleteMany({ where: { entityId: { in: createdOrderIds } } });
    await prisma.refund.deleteMany({ where: { orderId: { in: createdOrderIds } } });
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
  if (createdCustomerEmails.length > 0) {
    await prisma.user.deleteMany({ where: { email: { in: createdCustomerEmails } } });
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

async function checkoutOrder(agent: ReturnType<typeof request.agent>, variantId: string, paymentMethod: "COD" | "RAZORPAY") {
  await agent.post("/api/v1/cart/items").send({ variantId, quantity: 1 });
  const res = await agent
    .post("/api/v1/orders/checkout")
    .send({
      contactEmail: "buyer@test.woobe.internal",
      confirmEmail: "buyer@test.woobe.internal",
      address: checkoutAddress,
      paymentMethod,
    });
  expect(res.status).toBe(201);
  createdOrderIds.push(res.body.id);
  return res.body as { id: string; totalPaise: number };
}

function signPayload(body: string): string {
  return createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
}

/** Checks out RAZORPAY and drives the order all the way to CONFIRMED with a CAPTURED Payment, exactly like payments.integration.test.ts's own webhook test does. */
async function createConfirmedRazorpayOrder(variantId: string) {
  const agent = request.agent(app);
  const order = await checkoutOrder(agent, variantId, "RAZORPAY");

  const razorpayOrderId = `order_test_${randomUUID().slice(0, 12)}`;
  await prisma.payment.create({
    data: { orderId: order.id, provider: "RAZORPAY", status: "CREATED", amountPaise: order.totalPaise, razorpayOrderId },
  });

  const payload = {
    event: "payment.captured",
    payload: {
      payment: {
        entity: { id: `pay_test_${randomUUID().slice(0, 12)}`, order_id: razorpayOrderId, amount: order.totalPaise, status: "captured" },
      },
    },
  };
  const body = JSON.stringify(payload);
  const webhookRes = await request(app)
    .post("/api/v1/payments/razorpay/webhook")
    .set("X-Razorpay-Signature", signPayload(body))
    .set("X-Razorpay-Event-Id", randomUUID())
    .set("Content-Type", "application/json")
    .send(body);
  expect(webhookRes.status).toBe(200);

  return order;
}

/** Checks out COD and confirms it immediately (no gateway step), exactly like payments.integration.test.ts's own COD test does. */
async function createConfirmedCodOrder(variantId: string) {
  const agent = request.agent(app);
  const order = await checkoutOrder(agent, variantId, "COD");
  const confirmRes = await agent.post("/api/v1/payments/cod/confirm").send({ orderId: order.id });
  expect(confirmRes.status).toBe(200);
  return order;
}

async function registerCustomer(email: string, password: string): Promise<void> {
  await request(app).post("/api/v1/auth/register").send({ name: "Test Customer", email, password });
  createdCustomerEmails.push(email);
}

async function loginAdmin(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/v1/admin/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

describe("admin auth", () => {
  it("rejects a CUSTOMER login attempt with 403 and issues no admin cookie", async () => {
    const email = `${TEST_PREFIX}-${randomUUID()}@test.woobe.internal`;
    await registerCustomer(email, "Passw0rd");

    const res = await request(app).post("/api/v1/admin/auth/login").send({ email, password: "Passw0rd" });

    expect(res.status).toBe(403);
    expect(setCookieArray(res.headers["set-cookie"]).join(";")).not.toContain("admin_refresh_token");
  });

  it("logs in a SUPER_ADMIN and issues an admin_refresh_token cookie (not refresh_token)", async () => {
    const res = await request(app).post("/api/v1/admin/auth/login").send({ email: "admin@woobe.in", password: "Admin@12345" });

    expect(res.status).toBe(200);
    // NOTE: deviates from the brief's literal `.not.toContain("refresh_token=")`
    // substring check, which is unsatisfiable by construction — the string
    // "admin_refresh_token=" always contains "refresh_token=" as a substring,
    // so that assertion could never pass regardless of implementation
    // behavior. Checking exact cookie names instead preserves the test's
    // actual intent: only the admin-scoped cookie is set, never the
    // customer-scoped one (see admin-refresh-cookie.ts's own comment that
    // it's "deliberately a SEPARATE cookie from the customer refresh_token").
    const cookieNames = setCookieArray(res.headers["set-cookie"]).map((c) => c.split("=")[0]);
    expect(cookieNames).toContain("admin_refresh_token");
    expect(cookieNames).not.toContain("refresh_token");
  });
});

describe("admin orders RBAC", () => {
  it("403s a product_management_staff on every /admin/orders route", async () => {
    const accessToken = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const res = await request(app).get("/api/v1/admin/orders").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  it("allows an order_processing_staff to list orders", async () => {
    const accessToken = await loginAdmin("orders@woobe.in", "Staff@12345");
    const res = await request(app).get("/api/v1/admin/orders").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
  });
});

describe("order lifecycle + audit log", () => {
  it("walks CONFIRMED -> PROCESSING -> SHIPPED -> DELIVERED as order_processing_staff, logging each transition", async () => {
    const { variantId } = await createTestVariant(3);
    const order = await createConfirmedCodOrder(variantId);
    const accessToken = await loginAdmin("orders@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${accessToken}` };

    const processing = await request(app).post(`/api/v1/admin/orders/${order.id}/processing`).set(auth);
    expect(processing.status).toBe(200);
    expect(processing.body.status).toBe("PROCESSING");

    const shipped = await request(app)
      .post(`/api/v1/admin/orders/${order.id}/ship`)
      .set(auth)
      .send({ trackingNumber: "TRK123", carrier: "BlueDart" });
    expect(shipped.status).toBe(200);
    expect(shipped.body.status).toBe("SHIPPED");
    expect(shipped.body.trackingNumber).toBe("TRK123");

    const delivered = await request(app).post(`/api/v1/admin/orders/${order.id}/deliver`).set(auth);
    expect(delivered.status).toBe(200);
    expect(delivered.body.status).toBe("DELIVERED");
    expect(delivered.body.deliveredAt).not.toBeNull();

    const auditLogs = await prisma.adminAuditLog.findMany({ where: { entityId: order.id }, orderBy: { createdAt: "asc" } });
    expect(auditLogs.map((log) => log.action)).toEqual(["ORDER_PROCESSING_STARTED", "ORDER_SHIPPED", "ORDER_DELIVERED"]);
  });
});

describe("cancellation + refund", () => {
  it("cancelling a CONFIRMED COD order restocks inventory and triggers no refund", async () => {
    const { variantId } = await createTestVariant(3);
    const order = await createConfirmedCodOrder(variantId);
    const accessToken = await loginAdmin("orders@woobe.in", "Staff@12345");

    const beforeInventory = await prisma.inventory.findFirstOrThrow({ where: { variantId } });
    expect(beforeInventory.quantityReserved).toBe(0); // COD confirm already finalized the reservation into a deduction
    expect(beforeInventory.quantityAvailable).toBe(2); // 3 seeded - 1 finalized sale

    const res = await request(app)
      .post(`/api/v1/admin/orders/${order.id}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ reason: "test" });

    expect(res.status).toBe(200);
    expect(res.body.refundIssued).toBe(false);
    expect(res.body.order.status).toBe("CANCELLED");

    // Week 2 Day 0 remediation's own regression coverage: re-query
    // inventory AFTER the cancel, not just before — this is the exact
    // assertion the Week 1 test's name promised but never actually made,
    // which is how the restock bug shipped unnoticed.
    const afterInventory = await prisma.inventory.findFirstOrThrow({ where: { variantId } });
    expect(afterInventory.quantityAvailable).toBe(3); // restocked back to the pre-sale level
    expect(afterInventory.quantityReserved).toBe(0); // untouched — there was no hold to give back, only a sale to undo

    const refund = await prisma.refund.findFirst({ where: { orderId: order.id } });
    expect(refund).toBeNull();

    const auditLog = await prisma.adminAuditLog.findFirstOrThrow({ where: { entityId: order.id, action: "ORDER_CANCELLED" } });
    expect(auditLog.metadata).toMatchObject({ reason: "test", refundIssued: false });
  });

  it("cancelling an already-CANCELLED order is a no-op and does not double-restock inventory", async () => {
    const { variantId } = await createTestVariant(3);
    const order = await createConfirmedCodOrder(variantId);
    const accessToken = await loginAdmin("orders@woobe.in", "Staff@12345");

    const firstCancel = await request(app)
      .post(`/api/v1/admin/orders/${order.id}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ reason: "first" });
    expect(firstCancel.status).toBe(200);

    const afterFirstCancel = await prisma.inventory.findFirstOrThrow({ where: { variantId } });
    expect(afterFirstCancel.quantityAvailable).toBe(3);

    const secondCancel = await request(app)
      .post(`/api/v1/admin/orders/${order.id}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ reason: "second" });
    expect(secondCancel.status).toBe(200);
    expect(secondCancel.body.refundIssued).toBe(false);

    const afterSecondCancel = await prisma.inventory.findFirstOrThrow({ where: { variantId } });
    expect(afterSecondCancel.quantityAvailable).toBe(3); // NOT 4 — the second call must not restock again

    const auditLogs = await prisma.adminAuditLog.findMany({ where: { entityId: order.id, action: "ORDER_CANCELLED" } });
    expect(auditLogs).toHaveLength(1); // the second call's `changed: false` skips the audit write too
  });

  it("cancelling a CONFIRMED Razorpay order with today's unconfigured Razorpay keys still cancels the order and records a FAILED refund", async () => {
    const { variantId } = await createTestVariant(3);
    const order = await createConfirmedRazorpayOrder(variantId);
    const accessToken = await loginAdmin("orders@woobe.in", "Staff@12345");

    const res = await request(app)
      .post(`/api/v1/admin/orders/${order.id}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe("CANCELLED");
    expect(res.body.refundIssued).toBe(false); // Razorpay unconfigured in this test env — gateway-error branch

    const refund = await prisma.refund.findFirstOrThrow({ where: { orderId: order.id } });
    expect(refund.status).toBe("FAILED");

    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
    expect(payment.status).toBe("CAPTURED"); // NOT marked REFUNDED — the gateway call never succeeded

    // A failed refund attempt still cancelled the order — the stock restock
    // isn't gated on the refund succeeding (see CancelOrderUseCase's own
    // ordering: transition + restock commit first, refund is attempted
    // after, in admin's CancelOrderWithRefundUseCase).
    const inventory = await prisma.inventory.findFirstOrThrow({ where: { variantId } });
    expect(inventory.quantityAvailable).toBe(3);
  });
});
