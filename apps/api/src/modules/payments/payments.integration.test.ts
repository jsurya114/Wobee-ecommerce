import { createHmac, randomUUID } from "node:crypto";
import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

/**
 * Integration tests against the REAL test database (see auth's/orders' own
 * integration test files for the setup this mirrors). Covers Day 5's
 * explicit "Done when" bar (week1_excecution_prompt.md): COD confirms an
 * order immediately, and — the mandatory one — a duplicate Razorpay webhook
 * delivery does not double-confirm or double-charge an order.
 */

const TEST_PREFIX = "day5-integration";
const WEBHOOK_SECRET = "test-webhook-secret"; // matches vitest.config.ts
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
    await prisma.payment.deleteMany({ where: { orderId: { in: createdOrderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } }); // cascades OrderItem
  }
  if (createdVariantIds.length > 0) {
    await prisma.cartItem.deleteMany({ where: { variantId: { in: createdVariantIds } } });
    await prisma.productVariant.deleteMany({ where: { id: { in: createdVariantIds } } }); // cascades Inventory
  }
  if (createdProductIds.length > 0) {
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
  }
  await prisma.$disconnect();
});

async function createTestVariant(quantityAvailable: number): Promise<{ variantId: string }> {
  const suffix = crypto.randomUUID().slice(0, 8);
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

describe("payments: COD confirms immediately", () => {
  it("confirms the order and finalizes the reservation into a real deduction", async () => {
    const { variantId } = await createTestVariant(3);
    const agent = request.agent(app);
    const order = await checkoutOrder(agent, variantId, "COD");

    const confirmRes = await agent.post("/api/v1/payments/cod/confirm").send({ orderId: order.id });
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.alreadyConfirmed).toBe(false);

    const persisted = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(persisted.status).toBe("CONFIRMED");

    // Client-review fix (2026-09-03) — PENDING, not CAPTURED: no real cash
    // has moved yet at order-confirm time for cash-on-delivery. It only
    // becomes CAPTURED at actual delivery (see admin.integration.test.ts's
    // "order lifecycle" test for that transition).
    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
    expect(payment.provider).toBe("COD");
    expect(payment.status).toBe("PENDING");
    expect(payment.amountPaise).toBe(order.totalPaise);

    // Reservation finalized into a real deduction, not left as a phantom hold.
    const inventory = await prisma.inventory.findFirstOrThrow({ where: { variantId } });
    expect(inventory.quantityAvailable).toBe(2); // 3 seeded - 1 sold
    expect(inventory.quantityReserved).toBe(0);
  });

  it("is idempotent — confirming an already-confirmed order is a no-op, not a double charge", async () => {
    const { variantId } = await createTestVariant(3);
    const agent = request.agent(app);
    const order = await checkoutOrder(agent, variantId, "COD");

    const first = await agent.post("/api/v1/payments/cod/confirm").send({ orderId: order.id });
    expect(first.status).toBe(200);
    const second = await agent.post("/api/v1/payments/cod/confirm").send({ orderId: order.id });
    expect(second.status).toBe(200);
    expect(second.body.alreadyConfirmed).toBe(true);

    const payments = await prisma.payment.findMany({ where: { orderId: order.id } });
    expect(payments).toHaveLength(1); // not two

    const inventory = await prisma.inventory.findFirstOrThrow({ where: { variantId } });
    expect(inventory.quantityAvailable).toBe(2); // deducted once, not twice
  });
});

describe("payments: Razorpay webhook (ADR-014)", () => {
  it("rejects a webhook with an invalid signature", async () => {
    const body = JSON.stringify({ event: "payment.captured", payload: {} });
    const res = await request(app)
      .post("/api/v1/payments/razorpay/webhook")
      .set("X-Razorpay-Signature", "not-a-real-signature")
      .set("X-Razorpay-Event-Id", randomUUID())
      .set("Content-Type", "application/json")
      .send(body);

    expect(res.status).toBe(401);
  });

  it("confirms the order on payment.captured, and a resent duplicate delivery does not double-confirm or double-charge", async () => {
    const { variantId } = await createTestVariant(3);
    const agent = request.agent(app);
    const order = await checkoutOrder(agent, variantId, "RAZORPAY");

    // No real RAZORPAY_KEY_ID/SECRET in the test env (no network calls in
    // tests) — seed the Payment row directly, exactly what
    // CreateRazorpayOrderUseCase would have persisted after a real
    // Razorpay Orders API call.
    const razorpayOrderId = `order_test_${randomUUID().slice(0, 12)}`;
    await prisma.payment.create({
      data: { orderId: order.id, provider: "RAZORPAY", status: "CREATED", amountPaise: order.totalPaise, razorpayOrderId },
    });

    const eventId = randomUUID();
    const payload = {
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_test_${randomUUID().slice(0, 12)}`,
            order_id: razorpayOrderId,
            amount: order.totalPaise,
            status: "captured",
          },
        },
      },
    };
    const body = JSON.stringify(payload);
    const signature = signPayload(body);

    const first = await request(app)
      .post("/api/v1/payments/razorpay/webhook")
      .set("X-Razorpay-Signature", signature)
      .set("X-Razorpay-Event-Id", eventId)
      .set("Content-Type", "application/json")
      .send(body);
    expect(first.status).toBe(200);
    expect(first.body.result).toBe("processed");

    const confirmed = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(confirmed.status).toBe("CONFIRMED");
    const inventoryAfterFirst = await prisma.inventory.findFirstOrThrow({ where: { variantId } });
    expect(inventoryAfterFirst.quantityAvailable).toBe(2);
    expect(inventoryAfterFirst.quantityReserved).toBe(0);

    // Razorpay resends the EXACT same delivery (same event id, same body) —
    // the mandatory duplicate-webhook test.
    const second = await request(app)
      .post("/api/v1/payments/razorpay/webhook")
      .set("X-Razorpay-Signature", signature)
      .set("X-Razorpay-Event-Id", eventId)
      .set("Content-Type", "application/json")
      .send(body);
    expect(second.status).toBe(200);
    expect(second.body.result).toBe("deduped");

    // Nothing double-applied: status unchanged, inventory unchanged, still exactly one Payment row.
    const afterDuplicate = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(afterDuplicate.status).toBe("CONFIRMED");
    const inventoryAfterDuplicate = await prisma.inventory.findFirstOrThrow({ where: { variantId } });
    expect(inventoryAfterDuplicate.quantityAvailable).toBe(2);
    expect(inventoryAfterDuplicate.quantityReserved).toBe(0);
    const payments = await prisma.payment.findMany({ where: { orderId: order.id } });
    expect(payments).toHaveLength(1);
    expect(payments[0]!.status).toBe("CAPTURED");
  });

  it("marks the order PAYMENT_FAILED and releases the reservation on payment.failed, without deducting stock", async () => {
    const { variantId } = await createTestVariant(3);
    const agent = request.agent(app);
    const order = await checkoutOrder(agent, variantId, "RAZORPAY");

    const razorpayOrderId = `order_test_${randomUUID().slice(0, 12)}`;
    await prisma.payment.create({
      data: { orderId: order.id, provider: "RAZORPAY", status: "CREATED", amountPaise: order.totalPaise, razorpayOrderId },
    });

    const payload = {
      event: "payment.failed",
      payload: {
        payment: {
          entity: {
            id: `pay_test_${randomUUID().slice(0, 12)}`,
            order_id: razorpayOrderId,
            amount: order.totalPaise,
            status: "failed",
          },
        },
      },
    };
    const body = JSON.stringify(payload);

    const res = await request(app)
      .post("/api/v1/payments/razorpay/webhook")
      .set("X-Razorpay-Signature", signPayload(body))
      .set("X-Razorpay-Event-Id", randomUUID())
      .set("Content-Type", "application/json")
      .send(body);
    expect(res.status).toBe(200);

    const failed = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(failed.status).toBe("PAYMENT_FAILED");

    // Released, not deducted — the hold is given back, nothing was sold.
    const inventory = await prisma.inventory.findFirstOrThrow({ where: { variantId } });
    expect(inventory.quantityAvailable).toBe(3);
    expect(inventory.quantityReserved).toBe(0);
  });

  it("Week 3 Day 5: a late/out-of-order payment.captured arriving AFTER payment.failed already resolved the order is acked 200, not left to 500/409 — and does not resurrect the order", async () => {
    const { variantId } = await createTestVariant(3);
    const agent = request.agent(app);
    const order = await checkoutOrder(agent, variantId, "RAZORPAY");

    const razorpayOrderId = `order_test_${randomUUID().slice(0, 12)}`;
    await prisma.payment.create({
      data: { orderId: order.id, provider: "RAZORPAY", status: "CREATED", amountPaise: order.totalPaise, razorpayOrderId },
    });

    const failedPayload = {
      event: "payment.failed",
      payload: { payment: { entity: { id: `pay_test_${randomUUID().slice(0, 12)}`, order_id: razorpayOrderId, amount: order.totalPaise, status: "failed" } } },
    };
    const failedBody = JSON.stringify(failedPayload);
    const failedRes = await request(app)
      .post("/api/v1/payments/razorpay/webhook")
      .set("X-Razorpay-Signature", signPayload(failedBody))
      .set("X-Razorpay-Event-Id", randomUUID())
      .set("Content-Type", "application/json")
      .send(failedBody);
    expect(failedRes.status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAYMENT_FAILED");

    // A DIFFERENT event (its own eventId — not a redelivery of the one
    // above) for the SAME razorpayOrderId, arriving late — Razorpay's own
    // docs don't guarantee delivery order. The order has already moved on.
    const capturedPayload = {
      event: "payment.captured",
      payload: { payment: { entity: { id: `pay_test_${randomUUID().slice(0, 12)}`, order_id: razorpayOrderId, amount: order.totalPaise, status: "captured" } } },
    };
    const capturedBody = JSON.stringify(capturedPayload);
    const capturedRes = await request(app)
      .post("/api/v1/payments/razorpay/webhook")
      .set("X-Razorpay-Signature", signPayload(capturedBody))
      .set("X-Razorpay-Event-Id", randomUUID())
      .set("Content-Type", "application/json")
      .send(capturedBody);

    // Razorpay must get a 2xx here regardless — a non-2xx means Razorpay
    // retries this delivery forever (the controller's own doc comment
    // already promises this; this test holds it to that promise for the
    // one case that wasn't covered).
    expect(capturedRes.status).toBe(200);

    // The order must NOT flip back to CONFIRMED from a stale late event —
    // that would silently un-fail an order fulfillment already gave up on.
    const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(finalOrder.status).toBe("PAYMENT_FAILED");
    // Inventory stays released, not finalized into a deduction.
    const inventory = await prisma.inventory.findFirstOrThrow({ where: { variantId } });
    expect(inventory.quantityAvailable).toBe(3);
    expect(inventory.quantityReserved).toBe(0);
  });

  it("Week 3 Day 5: a late/out-of-order payment.failed arriving AFTER payment.captured already confirmed the order is acked 200 — and does not un-confirm it", async () => {
    const { variantId } = await createTestVariant(3);
    const agent = request.agent(app);
    const order = await checkoutOrder(agent, variantId, "RAZORPAY");

    const razorpayOrderId = `order_test_${randomUUID().slice(0, 12)}`;
    await prisma.payment.create({
      data: { orderId: order.id, provider: "RAZORPAY", status: "CREATED", amountPaise: order.totalPaise, razorpayOrderId },
    });

    const capturedPayload = {
      event: "payment.captured",
      payload: { payment: { entity: { id: `pay_test_${randomUUID().slice(0, 12)}`, order_id: razorpayOrderId, amount: order.totalPaise, status: "captured" } } },
    };
    const capturedBody = JSON.stringify(capturedPayload);
    const capturedRes = await request(app)
      .post("/api/v1/payments/razorpay/webhook")
      .set("X-Razorpay-Signature", signPayload(capturedBody))
      .set("X-Razorpay-Event-Id", randomUUID())
      .set("Content-Type", "application/json")
      .send(capturedBody);
    expect(capturedRes.status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("CONFIRMED");

    const failedPayload = {
      event: "payment.failed",
      payload: { payment: { entity: { id: `pay_test_${randomUUID().slice(0, 12)}`, order_id: razorpayOrderId, amount: order.totalPaise, status: "failed" } } },
    };
    const failedBody = JSON.stringify(failedPayload);
    const failedRes = await request(app)
      .post("/api/v1/payments/razorpay/webhook")
      .set("X-Razorpay-Signature", signPayload(failedBody))
      .set("X-Razorpay-Event-Id", randomUUID())
      .set("Content-Type", "application/json")
      .send(failedBody);

    expect(failedRes.status).toBe(200);

    const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(finalOrder.status).toBe("CONFIRMED"); // not un-confirmed by a stale late failure
    const inventory = await prisma.inventory.findFirstOrThrow({ where: { variantId } });
    expect(inventory.quantityAvailable).toBe(2); // still sold, not restored
  });

  it("Week 3 Day 5: a webhook for a razorpayOrderId with no local Payment record is acked 200 and ignored, not a crash", async () => {
    const payload = {
      event: "payment.captured",
      payload: { payment: { entity: { id: `pay_test_${randomUUID().slice(0, 12)}`, order_id: `order_unknown_${randomUUID().slice(0, 12)}`, amount: 10000, status: "captured" } } },
    };
    const body = JSON.stringify(payload);
    const res = await request(app)
      .post("/api/v1/payments/razorpay/webhook")
      .set("X-Razorpay-Signature", signPayload(body))
      .set("X-Razorpay-Event-Id", randomUUID())
      .set("Content-Type", "application/json")
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.result).toBe("ignored");
  });
});
