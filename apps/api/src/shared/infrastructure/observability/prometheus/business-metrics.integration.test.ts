import { createHmac, randomUUID } from "node:crypto";
import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../../../app";
import { registry } from "./metrics-registry";

/**
 * End-to-end (real Express app, real Postgres, production metrics
 * registry): asserts the DELTA each business action produces, so it is
 * independent of whatever other test files already incremented on the
 * process-wide registry. This is where "checkout rollback is not counted",
 * "COD replay is not double-counted" and "webhook replay is deduped" are
 * proven against the real transaction boundaries, not fakes.
 */
const TEST_PREFIX = "obs-integration";
const WEBHOOK_SECRET = "test-webhook-secret"; // matches vitest.config.ts
const app = createApp();

let categoryId: string;
let warehouseId: string;
const createdProductIds: string[] = [];
const createdVariantIds: string[] = [];
const createdOrderIds: string[] = [];

beforeAll(async () => {
  categoryId = (await prisma.category.findFirstOrThrow({ where: { isActive: true } })).id;
  warehouseId = (await prisma.warehouse.findFirstOrThrow({ where: { isActive: true } })).id;
});

afterAll(async () => {
  if (createdOrderIds.length > 0) {
    // Order-confirmed / payment-failed notifications reference the order only by order number inside their JSON payload.
    const numbers = (await prisma.order.findMany({ where: { id: { in: createdOrderIds } }, select: { orderNumber: true } })).map((o) => o.orderNumber);
    if (numbers.length > 0) {
      await prisma.notification.deleteMany({ where: { OR: numbers.map((n) => ({ payload: { path: ["orderNumber"], equals: n } })) } });
    }
    await prisma.payment.deleteMany({ where: { orderId: { in: createdOrderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  }
  if (createdVariantIds.length > 0) {
    await prisma.cartItem.deleteMany({ where: { variantId: { in: createdVariantIds } } });
    await prisma.productVariant.deleteMany({ where: { id: { in: createdVariantIds } } });
  }
  if (createdProductIds.length > 0) await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
  await prisma.$disconnect();
});

type Series = { labels: Record<string, string | number>; value: number; metricName?: string };

/** Sum of a counter/gauge over every series whose labels include `labels`. */
async function metric(name: string, labels: Record<string, string> = {}): Promise<number> {
  const all = await registry.getMetricsAsJSON();
  return ((all.find((m) => m.name === name)?.values ?? []) as Series[])
    .filter((v) => v.metricName === undefined || v.metricName === name)
    .filter((v) => Object.entries(labels).every(([k, val]) => v.labels[k] === val))
    .reduce((sum, v) => sum + v.value, 0);
}

async function snapshot() {
  return {
    createdCod: await metric("woobe_orders_created_total", { payment_method: "cod" }),
    createdOnline: await metric("woobe_orders_created_total", { payment_method: "online" }),
    confirmed: await metric("woobe_orders_event_total", { event: "confirmed" }),
    paymentFailed: await metric("woobe_orders_event_total", { event: "payment_failed" }),
    reserveOk: await metric("woobe_inventory_reservations_total", { result: "success" }),
    reserveFail: await metric("woobe_inventory_reservations_total", { result: "failure" }),
  };
}

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

const address = { fullName: "Test Buyer", phone: "9876543210", line1: "123 Test Street", city: "Bengaluru", state: "Karnataka", pincode: "560001" };

async function tryCheckout(agent: ReturnType<typeof request.agent>, variantId: string, paymentMethod: "COD" | "RAZORPAY") {
  await agent.post("/api/v1/cart/items").send({ variantId, quantity: 1 });
  return agent.post("/api/v1/orders/checkout").send({
    contactEmail: "buyer@test.woobe.internal",
    confirmEmail: "buyer@test.woobe.internal",
    address,
    paymentMethod,
  });
}

async function checkout(agent: ReturnType<typeof request.agent>, variantId: string, paymentMethod: "COD" | "RAZORPAY") {
  const res = await tryCheckout(agent, variantId, paymentMethod);
  expect(res.status).toBe(201);
  createdOrderIds.push(res.body.id);
  return res.body as { id: string; totalPaise: number };
}

const sign = (body: string) => createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");

async function seedRazorpayPayment(order: { id: string; totalPaise: number }): Promise<string> {
  const razorpayOrderId = `order_test_${randomUUID().slice(0, 12)}`;
  await prisma.payment.create({ data: { orderId: order.id, provider: "RAZORPAY", status: "CREATED", amountPaise: order.totalPaise, razorpayOrderId } });
  return razorpayOrderId;
}

function webhook(event: string, razorpayOrderId: string, amount: number, eventId = randomUUID()) {
  const body = JSON.stringify({ event, payload: { payment: { entity: { id: `pay_${randomUUID().slice(0, 10)}`, order_id: razorpayOrderId, amount, status: "x" } } } });
  const send = () =>
    request(app)
      .post("/api/v1/payments/razorpay/webhook")
      .set("X-Razorpay-Signature", sign(body))
      .set("X-Razorpay-Event-Id", eventId)
      .set("Content-Type", "application/json")
      .send(body);
  return { send };
}

describe("checkout metrics", () => {
  it("a successful COD checkout counts one created{cod} order and one successful reservation", async () => {
    const { variantId } = await createTestVariant(3);
    const before = await snapshot();
    await checkout(request.agent(app), variantId, "COD");
    const after = await snapshot();
    expect(after.createdCod - before.createdCod).toBe(1);
    expect(after.createdOnline - before.createdOnline).toBe(0);
    expect(after.reserveOk - before.reserveOk).toBe(1);
    expect(after.confirmed - before.confirmed).toBe(0); // created is not confirmed
  });

  it("a Razorpay checkout counts created{online}", async () => {
    const { variantId } = await createTestVariant(3);
    const before = await snapshot();
    await checkout(request.agent(app), variantId, "RAZORPAY");
    const after = await snapshot();
    expect(after.createdOnline - before.createdOnline).toBe(1);
  });

  it("two shoppers racing for the LAST unit: exactly one order is counted as created, the loser is not", async () => {
    const { variantId } = await createTestVariant(1);
    const a = request.agent(app);
    const b = request.agent(app);
    await a.post("/api/v1/cart/items").send({ variantId, quantity: 1 });
    await b.post("/api/v1/cart/items").send({ variantId, quantity: 1 });
    const body = { contactEmail: "buyer@test.woobe.internal", confirmEmail: "buyer@test.woobe.internal", address, paymentMethod: "COD" };

    const before = await snapshot();
    const [ra, rb] = await Promise.all([a.post("/api/v1/orders/checkout").send(body), b.post("/api/v1/orders/checkout").send(body)]);
    for (const r of [ra, rb]) if (r.status === 201) createdOrderIds.push(r.body.id);
    const after = await snapshot();

    expect([ra.status, rb.status].filter((s) => s === 201)).toHaveLength(1);
    expect([ra.status, rb.status].filter((s) => s >= 400)).toHaveLength(1);
    expect(after.createdCod - before.createdCod).toBe(1); // the failed one must not be counted as created
    expect(after.reserveOk - before.reserveOk).toBe(1);
  });
});

describe("COD confirmation metrics", () => {
  it("counts confirmed once, and an idempotent replay does not double-count", async () => {
    const { variantId } = await createTestVariant(3);
    const agent = request.agent(app);
    const order = await checkout(agent, variantId, "COD");

    const before = await snapshot();
    expect((await agent.post("/api/v1/payments/cod/confirm").send({ orderId: order.id })).body.alreadyConfirmed).toBe(false);
    expect((await agent.post("/api/v1/payments/cod/confirm").send({ orderId: order.id })).body.alreadyConfirmed).toBe(true);
    const after = await snapshot();
    expect(after.confirmed - before.confirmed).toBe(1);
  });
});

describe("Razorpay webhook metrics", () => {
  it("counts the confirmation once; the resent delivery is `deduped` and adds no confirmation", async () => {
    const { variantId } = await createTestVariant(3);
    const order = await checkout(request.agent(app), variantId, "RAZORPAY");
    const rzp = await seedRazorpayPayment(order);
    const delivery = webhook("payment.captured", rzp, order.totalPaise);

    const before = await snapshot();
    const processedBefore = await metric("woobe_payment_webhooks_total", { event_type: "payment.captured", result: "processed" });
    const dedupedBefore = await metric("woobe_payment_webhooks_total", { event_type: "payment.captured", result: "deduped" });

    expect((await delivery.send()).body.result).toBe("processed");
    expect((await delivery.send()).body.result).toBe("deduped");

    const after = await snapshot();
    expect(after.confirmed - before.confirmed).toBe(1);
    expect((await metric("woobe_payment_webhooks_total", { event_type: "payment.captured", result: "processed" })) - processedBefore).toBe(1);
    expect((await metric("woobe_payment_webhooks_total", { event_type: "payment.captured", result: "deduped" })) - dedupedBefore).toBe(1);
  });

  it("payment.failed counts payment_failed once", async () => {
    const { variantId } = await createTestVariant(3);
    const order = await checkout(request.agent(app), variantId, "RAZORPAY");
    const rzp = await seedRazorpayPayment(order);

    const before = await snapshot();
    expect((await webhook("payment.failed", rzp, order.totalPaise).send()).body.result).toBe("processed");
    expect((await snapshot()).paymentFailed - before.paymentFailed).toBe(1);
  });

  it("an amount mismatch confirms nothing and is counted as `amount-mismatch`", async () => {
    const { variantId } = await createTestVariant(3);
    const order = await checkout(request.agent(app), variantId, "RAZORPAY");
    const rzp = await seedRazorpayPayment(order);

    const before = await snapshot();
    const mismatchBefore = await metric("woobe_payment_webhooks_total", { result: "amount-mismatch" });
    expect((await webhook("payment.captured", rzp, order.totalPaise + 1).send()).body.result).toBe("amount-mismatch");
    expect((await snapshot()).confirmed - before.confirmed).toBe(0);
    expect((await metric("woobe_payment_webhooks_total", { result: "amount-mismatch" })) - mismatchBefore).toBe(1);
  });

  it("a forged (bad-signature) delivery does not touch any webhook or order metric", async () => {
    const before = await snapshot();
    const webhooksBefore = await metric("woobe_payment_webhooks_total");
    const res = await request(app)
      .post("/api/v1/payments/razorpay/webhook")
      .set("X-Razorpay-Signature", "forged")
      .set("X-Razorpay-Event-Id", randomUUID())
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ event: "evil.forged.event", payload: {} }));
    expect(res.status).toBe(401);
    expect(await metric("woobe_payment_webhooks_total")).toBe(webhooksBefore);
    expect(await snapshot()).toEqual(before);
    expect(await registry.metrics()).not.toContain("evil.forged.event");
  });
});

describe("HTTP metrics through the real app", () => {
  it("labels a real error response (via next(err)) with its FULL mounted route template", async () => {
    const res = await request(app).post("/api/v1/payments/cod/confirm").send({ orderId: randomUUID() });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const before = await metric("woobe_http_requests_total", { route: "/api/v1/payments/cod/confirm", method: "POST" });
    expect(before).toBeGreaterThanOrEqual(1);
    const routes = ((await registry.getMetricsAsJSON()).find((m) => m.name === "woobe_http_requests_total")?.values ?? []).map((v) => String((v as Series).labels.route));
    expect(routes.filter((r) => r.startsWith("/:") || r === "/")).toEqual([]); // no baseUrl-less fragments
  });

  it("counts a request rejected by the body parser (malformed JSON -> 400) as UNMATCHED, because the metrics middleware runs before it", async () => {
    const before = await metric("woobe_http_requests_total", { route: "UNMATCHED", status_code: "400", method: "POST" });
    const res = await request(app).post("/api/v1/auth/login").set("Content-Type", "application/json").send("{bad json");
    expect(res.status).toBe(400);
    expect((await metric("woobe_http_requests_total", { route: "UNMATCHED", status_code: "400", method: "POST" })) - before).toBe(1);
    expect(await registry.metrics()).not.toContain("bad json");
  });

  it("does not record the request that produced an unmatched path under its raw path", async () => {
    await request(app).get("/api/v1/this-path-must-never-become-a-label-4f9c");
    expect(await registry.metrics()).not.toContain("4f9c");
  });
});

describe("GET /metrics", () => {
  it("serves Prometheus text with the registry's content type, including runtime and business metrics", async () => {
    const res = await request(app).get("/metrics");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.headers["content-type"]).toContain("version=0.0.4");
    for (const expected of [
      "# TYPE woobe_http_requests_total counter",
      "# TYPE woobe_http_request_duration_seconds histogram",
      "# TYPE woobe_orders_created_total counter",
      "woobe_node_process_resident_memory_bytes",
      "woobe_node_nodejs_eventloop_lag_seconds",
      "woobe_node_nodejs_heap_size_used_bytes",
    ]) {
      expect(res.text, expected).toContain(expected);
    }
  });

  it("does not reflect request cookies, auth headers, bodies or query strings, and is not itself counted as traffic", async () => {
    const before = await metric("woobe_http_requests_total");
    const res = await request(app)
      .get("/metrics?leak=query-secret-zz1")
      .set("Cookie", "refresh_token=cookie-secret-zz2")
      .set("Authorization", "Bearer bearer-secret-zz3")
      .set("X-Request-Id", "reqid-zz4");
    expect(res.status).toBe(200);
    for (const secret of ["query-secret-zz1", "cookie-secret-zz2", "bearer-secret-zz3", "reqid-zz4"]) {
      expect(res.text).not.toContain(secret);
    }
    expect(await metric("woobe_http_requests_total")).toBe(before);
  });

  it("refuses to serve /metrics to anything that came through the proxy (X-Forwarded-* present) — the second layer behind nginx", async () => {
    for (const header of ["X-Forwarded-For", "X-Forwarded-Host", "X-Forwarded-Proto", "X-Real-IP", "Forwarded", "CF-Connecting-IP"]) {
      const res = await request(app).get("/metrics").set(header, header === "Forwarded" ? "for=1.2.3.4" : "1.2.3.4");
      expect(res.status, header).toBe(404);
      expect(res.text, header).not.toContain("woobe_");
    }
  });

  it("the case/slash variants Express also serves behave exactly like /metrics: served directly, refused via the proxy, never counted as traffic", async () => {
    const before = await metric("woobe_http_requests_total");
    for (const path of ["/metrics/", "/METRICS", "/Metrics/"]) {
      const direct = await request(app).get(path);
      expect(direct.status, path).toBe(200);
      expect(direct.text, path).toContain("# TYPE woobe_http_requests_total counter");
      expect((await request(app).get(path).set("X-Forwarded-For", "9.9.9.9")).status, `${path} via proxy`).toBe(404);
    }
    expect(await metric("woobe_http_requests_total")).toBe(before);
  });

  it("carries no configuration secrets", async () => {
    const text = (await request(app).get("/metrics")).text;
    for (const secret of [process.env.JWT_ACCESS_SECRET, process.env.JWT_REFRESH_SECRET, process.env.COOKIE_SECRET, process.env.RAZORPAY_WEBHOOK_SECRET, process.env.DATABASE_URL, process.env.REDIS_URL]) {
      if (secret) expect(text).not.toContain(secret);
    }
  });
});
