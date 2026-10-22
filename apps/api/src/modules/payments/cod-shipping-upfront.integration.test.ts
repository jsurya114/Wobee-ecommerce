// apps/api/src/modules/payments/cod-shipping-upfront.integration.test.ts
import { createHmac, randomUUID } from "node:crypto";
import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

/**
 * COD shipping upfront (2026-09-28) against the REAL test database: with the
 * setting on, a COD order carrying a delivery fee is created PENDING_PAYMENT
 * with `payableOnDeliveryPaise` set; it can't be confirmed by the client's
 * /cod/confirm call; only a signature-verified Razorpay capture of EXACTLY the
 * delivery fee confirms it; the rest stays a PENDING cash payment until
 * delivery; and cancelling it refunds only the prepaid fee. No real Razorpay
 * calls — the Payment row CreateRazorpayOrderUseCase would persist is seeded
 * directly, same convention as payments.integration.test.ts.
 */

const TEST_PREFIX = "cod-upfront-integration";
const WEBHOOK_SECRET = "test-webhook-secret"; // matches vitest.config.ts
const app = createApp();

let categoryId: string;
let warehouseId: string;
let previousConfig: Awaited<ReturnType<typeof prisma.appConfig.findUnique>>;
const createdProductIds: string[] = [];
const createdVariantIds: string[] = [];
const createdOrderIds: string[] = [];

beforeAll(async () => {
  categoryId = (await prisma.category.findFirstOrThrow({ where: { isActive: true } })).id;
  warehouseId = (await prisma.warehouse.findFirstOrThrow({ where: { isActive: true } })).id;
  previousConfig = await prisma.appConfig.findUnique({ where: { id: "singleton" } });
});

afterAll(async () => {
  if (previousConfig) {
    await prisma.appConfig.update({ where: { id: "singleton" }, data: { codShippingUpfront: previousConfig.codShippingUpfront } });
  } else {
    await prisma.appConfig.deleteMany({ where: { id: "singleton" } });
  }
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
  await prisma.$disconnect();
});

async function setUpfront(enabled: boolean): Promise<void> {
  await prisma.appConfig.upsert({ where: { id: "singleton" }, create: { codShippingUpfront: enabled }, update: { codShippingUpfront: enabled } });
}

async function createTestVariant(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const product = await prisma.product.create({
    data: { name: `${TEST_PREFIX} Product ${suffix}`, slug: `${TEST_PREFIX}-${suffix}`, categoryId, isActive: true },
  });
  createdProductIds.push(product.id);
  // 1200g: over the 1kg minimum, under the 1.5kg free-delivery threshold — a delivery fee applies.
  const variant = await prisma.productVariant.create({
    data: { productId: product.id, sku: `${TEST_PREFIX}-${suffix}`, color: "Black", size: "M", weightGrams: 1200, isActive: true },
  });
  createdVariantIds.push(variant.id);
  await prisma.inventory.create({ data: { variantId: variant.id, warehouseId, quantityAvailable: 5, quantityReserved: 0 } });
  return variant.id;
}

type PlacedOrder = { id: string; totalPaise: number; shippingFeePaise: number; payableOnDeliveryPaise: number | null; shippingPaidUpfront: boolean };

async function checkoutCod(agent: ReturnType<typeof request.agent>, variantId: string): Promise<PlacedOrder> {
  await agent.post("/api/v1/cart/items").send({ variantId, quantity: 1 });
  const res = await agent.post("/api/v1/orders/checkout").send({
    contactEmail: "buyer@test.woobe.internal",
    confirmEmail: "buyer@test.woobe.internal",
    address: { fullName: "Test Buyer", phone: "9876543210", line1: "1 Test St", city: "Bengaluru", state: "Karnataka", pincode: "560001" },
    paymentMethod: "COD",
  });
  expect(res.status).toBe(201);
  createdOrderIds.push(res.body.id);
  return res.body as PlacedOrder;
}

async function sendWebhook(event: "payment.captured" | "payment.failed", razorpayOrderId: string, amount: number) {
  const body = JSON.stringify({
    event,
    payload: { payment: { entity: { id: `pay_test_${randomUUID().slice(0, 12)}`, order_id: razorpayOrderId, amount, status: "captured" } } },
  });
  return request(app)
    .post("/api/v1/payments/razorpay/webhook")
    .set("X-Razorpay-Signature", createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex"))
    .set("X-Razorpay-Event-Id", randomUUID())
    .set("Content-Type", "application/json")
    .send(body);
}

/** Exactly what CreateRazorpayOrderUseCase persists for a COD delivery-fee charge. */
async function seedDeliveryFeePayment(order: PlacedOrder): Promise<string> {
  const razorpayOrderId = `order_test_${randomUUID().slice(0, 12)}`;
  await prisma.payment.create({
    data: {
      orderId: order.id,
      provider: "COD",
      status: "CREATED",
      amountPaise: order.totalPaise,
      upfrontAmountPaise: order.shippingFeePaise,
      razorpayOrderId,
    },
  });
  return razorpayOrderId;
}

async function loginAdmin(): Promise<string> {
  const res = await request(app).post("/api/v1/admin/auth/login").send({ email: "admin@woobe.in", password: "Admin@12345" });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

describe("COD shipping upfront: setting OFF (default)", () => {
  it("leaves COD exactly as before — nothing to prepay, /cod/confirm confirms immediately", async () => {
    await setUpfront(false);
    const agent = request.agent(app);
    const order = await checkoutCod(agent, await createTestVariant());
    expect(order.shippingFeePaise).toBeGreaterThan(0);
    expect(order.payableOnDeliveryPaise).toBeNull();
    expect((await agent.post("/api/v1/payments/cod/confirm").send({ orderId: order.id })).status).toBe(200);
  });
});

describe("COD shipping upfront: setting ON", () => {
  it("records the cash-on-delivery balance, refuses /cod/confirm, and confirms only on a capture of exactly the delivery fee", async () => {
    await setUpfront(true);
    const variantId = await createTestVariant();
    const agent = request.agent(app);
    const order = await checkoutCod(agent, variantId);

    expect(order.shippingPaidUpfront).toBe(false);
    expect(order.payableOnDeliveryPaise).toBe(order.totalPaise - order.shippingFeePaise);

    const direct = await agent.post("/api/v1/payments/cod/confirm").send({ orderId: order.id });
    expect(direct.status).toBe(409);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING_PAYMENT");

    const razorpayOrderId = await seedDeliveryFeePayment(order);

    // Paying the whole order total online is NOT what was charged — rejected as a mismatch, nothing confirmed.
    const wrongAmount = await sendWebhook("payment.captured", razorpayOrderId, order.totalPaise);
    expect(wrongAmount.body.result).toBe("amount-mismatch");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING_PAYMENT");

    const captured = await sendWebhook("payment.captured", razorpayOrderId, order.shippingFeePaise);
    expect(captured.body.result).toBe("processed");

    const confirmed = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(confirmed.status).toBe("CONFIRMED");
    expect(confirmed.shippingPaidUpfront).toBe(true);
    const payment = await prisma.payment.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(payment.status).toBe("PENDING"); // the cash balance is still owed
    expect(payment.razorpayPaymentId).toMatch(/^pay_test_/);
    const inventory = await prisma.inventory.findFirstOrThrow({ where: { variantId } });
    expect(inventory).toMatchObject({ quantityAvailable: 4, quantityReserved: 0 });

    // The customer's own order view carries the split for the confirmation page.
    const view = await agent.get(`/api/v1/orders/${order.id}`);
    expect(view.body).toMatchObject({ shippingPaidUpfront: true, payableOnDeliveryPaise: order.totalPaise - order.shippingFeePaise });

    // Delivery collects the cash — the same COD capture path as always.
    const auth = { Authorization: `Bearer ${await loginAdmin()}` };
    for (const step of ["processing", "packed"]) {
      expect((await request(app).post(`/api/v1/admin/orders/${order.id}/${step}`).set(auth)).status).toBe(200);
    }
    expect((await request(app).post(`/api/v1/admin/orders/${order.id}/ship`).set(auth).send({ trackingNumber: "T1", carrier: "BlueDart" })).status).toBe(200);
    expect((await request(app).post(`/api/v1/admin/orders/${order.id}/deliver`).set(auth)).status).toBe(200);
    expect((await prisma.payment.findUniqueOrThrow({ where: { orderId: order.id } })).status).toBe("CAPTURED");
  });

  it("releases the reservation when the delivery-fee payment fails", async () => {
    await setUpfront(true);
    const variantId = await createTestVariant();
    const order = await checkoutCod(request.agent(app), variantId);
    const razorpayOrderId = await seedDeliveryFeePayment(order);

    expect((await sendWebhook("payment.failed", razorpayOrderId, order.shippingFeePaise)).status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAYMENT_FAILED");
    expect(await prisma.inventory.findFirstOrThrow({ where: { variantId } })).toMatchObject({ quantityAvailable: 5, quantityReserved: 0 });
  });

  it("cancelling after the fee was captured attempts a refund of ONLY the delivery fee", async () => {
    await setUpfront(true);
    const order = await checkoutCod(request.agent(app), await createTestVariant());
    const razorpayOrderId = await seedDeliveryFeePayment(order);
    await sendWebhook("payment.captured", razorpayOrderId, order.shippingFeePaise);

    const res = await request(app)
      .post(`/api/v1/admin/orders/${order.id}/cancel`)
      .set("Authorization", `Bearer ${await loginAdmin()}`)
      .send({ reason: "Customer request" });
    expect(res.status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("CANCELLED");

    // No real Razorpay keys in tests, so the gateway call fails — the attempt is
    // recorded (for manual follow-up) for the fee amount, never the order total.
    const refunds = await prisma.refund.findMany({ where: { orderId: order.id } });
    expect(refunds).toHaveLength(1);
    expect(refunds[0]!.amountPaise).toBe(order.shippingFeePaise);
  });
});
