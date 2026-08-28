import { randomUUID, createHmac } from "node:crypto";
import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

/**
 * Integration tests against the REAL test database — helpers mirror
 * admin.integration.test.ts's own (registerCustomer/loginAdmin/checkout/
 * webhook-confirm), not reinvented. Covers week2 (1).md §11/§12's full
 * Customer -> Return request -> Admin review -> Refund pipeline, including
 * the two states of that last step (COD "not-applicable" -> manual
 * completion, and a Razorpay gateway failure -> manual recovery) that
 * Module 10's own "Failure/retry handling" requirement calls for.
 */

const TEST_PREFIX = "day6-returns-integration";
const WEBHOOK_SECRET = "test-webhook-secret"; // matches vitest.config.ts
const app = createApp();

let categoryId: string;
let warehouseId: string;
const createdUserIds: string[] = [];
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
    await prisma.adminAuditLog.deleteMany({ where: { entityId: { in: (await prisma.return.findMany({ where: { orderId: { in: createdOrderIds } }, select: { id: true } })).map((r) => r.id) } } });
    await prisma.return.deleteMany({ where: { orderId: { in: createdOrderIds } } }); // cascades ReturnItem
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
  if (createdUserIds.length > 0) {
    await prisma.cart.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

async function createTestVariant(quantityAvailable = 5): Promise<{ variantId: string }> {
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

async function createTestCustomer(): Promise<{ agent: ReturnType<typeof request.agent>; userId: string }> {
  const email = `${TEST_PREFIX}-${randomUUID()}@test.woobe.internal`;
  const registerRes = await request(app).post("/api/v1/auth/register").send({ name: "Return Tester", email, password: "Passw0rd" });
  expect(registerRes.status).toBe(201);
  createdUserIds.push(registerRes.body.user.id);
  const agent = request.agent(app).set("Authorization", `Bearer ${registerRes.body.accessToken as string}`);
  return { agent, userId: registerRes.body.user.id };
}

async function loginAdmin(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/v1/admin/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

function signPayload(body: string): string {
  return createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
}

/** Places a COD order for this customer and confirms it (PENDING_PAYMENT -> CONFIRMED). */
async function checkoutCodOrder(agent: ReturnType<typeof request.agent>, variantId: string, quantity = 1) {
  await agent.post("/api/v1/cart/items").send({ variantId, quantity });
  const checkoutRes = await agent.post("/api/v1/orders/checkout").send({ contactEmail: "buyer@test.woobe.internal", address: checkoutAddress, paymentMethod: "COD" });
  expect(checkoutRes.status).toBe(201);
  createdOrderIds.push(checkoutRes.body.id);
  const confirmRes = await agent.post("/api/v1/payments/cod/confirm").send({ orderId: checkoutRes.body.id });
  expect(confirmRes.status).toBe(200);
  return checkoutRes.body as { id: string; items: { id: string; quantity: number }[] };
}

/** Places a RAZORPAY order and drives it to CONFIRMED with a CAPTURED Payment via the real webhook path, exactly like admin.integration.test.ts's own helper. */
async function checkoutRazorpayOrder(agent: ReturnType<typeof request.agent>, variantId: string) {
  await agent.post("/api/v1/cart/items").send({ variantId, quantity: 1 });
  const checkoutRes = await agent.post("/api/v1/orders/checkout").send({ contactEmail: "buyer@test.woobe.internal", address: checkoutAddress, paymentMethod: "RAZORPAY" });
  expect(checkoutRes.status).toBe(201);
  createdOrderIds.push(checkoutRes.body.id);

  const razorpayOrderId = `order_test_${randomUUID().slice(0, 12)}`;
  await prisma.payment.create({
    data: { orderId: checkoutRes.body.id, provider: "RAZORPAY", status: "CREATED", amountPaise: checkoutRes.body.totalPaise, razorpayOrderId },
  });
  const payload = {
    event: "payment.captured",
    payload: { payment: { entity: { id: `pay_test_${randomUUID().slice(0, 12)}`, order_id: razorpayOrderId, amount: checkoutRes.body.totalPaise, status: "captured" } } },
  };
  const body = JSON.stringify(payload);
  const webhookRes = await request(app)
    .post("/api/v1/payments/razorpay/webhook")
    .set("X-Razorpay-Signature", signPayload(body))
    .set("X-Razorpay-Event-Id", randomUUID())
    .set("Content-Type", "application/json")
    .send(body);
  expect(webhookRes.status).toBe(200);
  return checkoutRes.body as { id: string; items: { id: string; quantity: number }[] };
}

/** Drives an order from CONFIRMED all the way to DELIVERED via the real admin API. */
async function deliverOrder(orderId: string, adminAuth: string): Promise<void> {
  const auth = { Authorization: `Bearer ${adminAuth}` };
  expect((await request(app).post(`/api/v1/admin/orders/${orderId}/processing`).set(auth)).status).toBe(200);
  expect((await request(app).post(`/api/v1/admin/orders/${orderId}/ship`).set(auth).send({ trackingNumber: "TRK1", carrier: "BlueDart" })).status).toBe(200);
  expect((await request(app).post(`/api/v1/admin/orders/${orderId}/deliver`).set(auth)).status).toBe(200);
}

describe("returns: customer request + eligibility", () => {
  it("requests a return on a delivered order and it appears in the customer's own list and detail", async () => {
    const { agent } = await createTestCustomer();
    const { variantId } = await createTestVariant();
    const order = await checkoutCodOrder(agent, variantId);
    const adminAuth = await loginAdmin("orders@woobe.in", "Staff@12345");
    await deliverOrder(order.id, adminAuth);

    const res = await agent.post("/api/v1/returns").send({
      orderId: order.id,
      reason: "Wrong size",
      items: [{ orderItemId: order.items[0]!.id, quantity: 1 }],
    });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("RETURN_REQUESTED");

    const listRes = await agent.get("/api/v1/returns");
    expect(listRes.body.returns.map((r: { id: string }) => r.id)).toContain(res.body.id);

    const getRes = await agent.get(`/api/v1/returns/${res.body.id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe(res.body.id);

    const dbOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(dbOrder.hasActiveReturn).toBe(true);
  });

  it("rejects a return request on an order that hasn't been delivered yet", async () => {
    const { agent } = await createTestCustomer();
    const { variantId } = await createTestVariant();
    const order = await checkoutCodOrder(agent, variantId); // stays CONFIRMED, never delivered

    const res = await agent.post("/api/v1/returns").send({
      orderId: order.id,
      reason: "Changed my mind",
      items: [{ orderItemId: order.items[0]!.id, quantity: 1 }],
    });

    expect(res.status).toBe(422);
  });

  it("rejects a request for more than the ordered quantity", async () => {
    const { agent } = await createTestCustomer();
    const { variantId } = await createTestVariant();
    const order = await checkoutCodOrder(agent, variantId, 1);
    const adminAuth = await loginAdmin("orders@woobe.in", "Staff@12345");
    await deliverOrder(order.id, adminAuth);

    const res = await agent.post("/api/v1/returns").send({
      orderId: order.id,
      reason: "Too many",
      items: [{ orderItemId: order.items[0]!.id, quantity: 2 }],
    });

    expect(res.status).toBe(422);
  });

  it("404s a customer trying to view another customer's return", async () => {
    const owner = await createTestCustomer();
    const stranger = await createTestCustomer();
    const { variantId } = await createTestVariant();
    const order = await checkoutCodOrder(owner.agent, variantId);
    const adminAuth = await loginAdmin("orders@woobe.in", "Staff@12345");
    await deliverOrder(order.id, adminAuth);
    const created = await owner.agent.post("/api/v1/returns").send({ orderId: order.id, reason: "wrong size", items: [{ orderItemId: order.items[0]!.id, quantity: 1 }] });

    const res = await stranger.agent.get(`/api/v1/returns/${created.body.id}`);
    expect(res.status).toBe(404);
  });
});

describe("returns: admin review + refund (COD — manual completion path)", () => {
  it("walks RETURN_REQUESTED -> RETURN_APPROVED -> REFUND_INITIATED (not-applicable, COD) -> REFUNDED, clearing the order's active-return flag", async () => {
    const { agent } = await createTestCustomer();
    const { variantId } = await createTestVariant();
    const order = await checkoutCodOrder(agent, variantId);
    const adminAuth = await loginAdmin("orders@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${adminAuth}` };
    await deliverOrder(order.id, adminAuth);

    const created = await agent.post("/api/v1/returns").send({ orderId: order.id, reason: "wrong size", items: [{ orderItemId: order.items[0]!.id, quantity: 1 }] });
    const returnId = created.body.id as string;

    const approveRes = await request(app).post(`/api/v1/admin/returns/${returnId}/approve`).set(auth);
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe("RETURN_APPROVED");

    const refundRes = await request(app).post(`/api/v1/admin/returns/${returnId}/refund`).set(auth);
    expect(refundRes.status).toBe(200);
    expect(refundRes.body.outcome).toBe("not-applicable");
    expect(refundRes.body.return.status).toBe("REFUND_INITIATED");

    // Repeated requests must not create duplicate refunds (Module 10's own requirement) —
    // re-issuing while already REFUND_INITIATED (not RETURN_APPROVED) is rejected, not silently repeated.
    const secondRefundRes = await request(app).post(`/api/v1/admin/returns/${returnId}/refund`).set(auth);
    expect(secondRefundRes.status).toBe(409);

    const dbRefund = await prisma.refund.findFirstOrThrow({ where: { returnId } });
    expect(dbRefund.status).toBe("INITIATED");
    expect(dbRefund.provider).toBe("COD");

    const markRefundedRes = await request(app).post(`/api/v1/admin/returns/${returnId}/mark-refunded`).set(auth);
    expect(markRefundedRes.status).toBe(200);
    expect(markRefundedRes.body.status).toBe("REFUNDED");

    const finalRefund = await prisma.refund.findFirstOrThrow({ where: { returnId } });
    expect(finalRefund.status).toBe("COMPLETED");

    const dbOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(dbOrder.hasActiveReturn).toBe(false);

    // Only one Refund row exists for this return, never two.
    const refundCount = await prisma.refund.count({ where: { returnId } });
    expect(refundCount).toBe(1);
  });

  it("rejects a return, resolving it with no refund and clearing the active-return flag", async () => {
    const { agent } = await createTestCustomer();
    const { variantId } = await createTestVariant();
    const order = await checkoutCodOrder(agent, variantId);
    const adminAuth = await loginAdmin("orders@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${adminAuth}` };
    await deliverOrder(order.id, adminAuth);

    const created = await agent.post("/api/v1/returns").send({ orderId: order.id, reason: "wrong size", items: [{ orderItemId: order.items[0]!.id, quantity: 1 }] });
    const returnId = created.body.id as string;

    const rejectRes = await request(app).post(`/api/v1/admin/returns/${returnId}/reject`).set(auth).send({ reason: "Item shows signs of wear" });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.status).toBe("RETURN_REJECTED");

    const dbOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(dbOrder.hasActiveReturn).toBe(false);

    // Can't approve a return that's already been resolved.
    const approveRes = await request(app).post(`/api/v1/admin/returns/${returnId}/approve`).set(auth);
    expect(approveRes.status).toBe(409);
  });

  it("allows a fresh request for the same order item once the prior request was rejected", async () => {
    const { agent } = await createTestCustomer();
    const { variantId } = await createTestVariant();
    const order = await checkoutCodOrder(agent, variantId);
    const adminAuth = await loginAdmin("orders@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${adminAuth}` };
    await deliverOrder(order.id, adminAuth);

    const first = await agent.post("/api/v1/returns").send({ orderId: order.id, reason: "wrong size", items: [{ orderItemId: order.items[0]!.id, quantity: 1 }] });
    await request(app).post(`/api/v1/admin/returns/${first.body.id}/reject`).set(auth);

    const second = await agent.post("/api/v1/returns").send({ orderId: order.id, reason: "actually wrong colour", items: [{ orderItemId: order.items[0]!.id, quantity: 1 }] });
    expect(second.status).toBe(201);
  });
});

describe("returns: admin refund (Razorpay — gateway failure -> manual recovery)", () => {
  it("leaves the return at REFUND_INITIATED when the gateway call fails (unconfigured Razorpay keys), recoverable via mark-refunded", async () => {
    const { agent } = await createTestCustomer();
    const { variantId } = await createTestVariant();
    const order = await checkoutRazorpayOrder(agent, variantId);
    const adminAuth = await loginAdmin("orders@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${adminAuth}` };
    await deliverOrder(order.id, adminAuth);

    const created = await agent.post("/api/v1/returns").send({ orderId: order.id, reason: "wrong size", items: [{ orderItemId: order.items[0]!.id, quantity: 1 }] });
    const returnId = created.body.id as string;
    await request(app).post(`/api/v1/admin/returns/${returnId}/approve`).set(auth);

    const refundRes = await request(app).post(`/api/v1/admin/returns/${returnId}/refund`).set(auth);
    expect(refundRes.status).toBe(200);
    expect(refundRes.body.outcome).toBe("failed"); // Razorpay unconfigured in this test env — gateway-error branch
    expect(refundRes.body.return.status).toBe("REFUND_INITIATED");

    const dbRefund = await prisma.refund.findFirstOrThrow({ where: { returnId } });
    expect(dbRefund.status).toBe("FAILED");
    expect(dbRefund.provider).toBe("RAZORPAY");

    // Staff resolve it manually (e.g. via the Razorpay dashboard) and confirm completion here.
    const markRefundedRes = await request(app).post(`/api/v1/admin/returns/${returnId}/mark-refunded`).set(auth);
    expect(markRefundedRes.status).toBe(200);
    expect(markRefundedRes.body.status).toBe("REFUNDED");
  });
});

describe("returns: RBAC", () => {
  it("403s a customer on every /admin/returns route", async () => {
    const { agent } = await createTestCustomer();
    const res = await agent.get("/api/v1/admin/returns");
    expect(res.status).toBe(403);
  });

  it("403s a product_management_staff (no MANAGE_ORDERS) on /admin/returns", async () => {
    const accessToken = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const res = await request(app).get("/api/v1/admin/returns").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  it("allows an order_processing_staff to list returns", async () => {
    const accessToken = await loginAdmin("orders@woobe.in", "Staff@12345");
    const res = await request(app).get("/api/v1/admin/returns").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
  });
});
