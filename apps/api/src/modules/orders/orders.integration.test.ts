import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

/**
 * Integration tests against the REAL test database (see auth's own
 * integration test file for the setup this mirrors — DATABASE_URL points at
 * woobe_test). Covers Day 4's explicit "Done when" bar (week1_excecution_prompt.md):
 * a checkout attempt reserves stock correctly under concurrency, and the
 * order row carries a full, independent price/tax/shipping snapshot.
 */

const TEST_PREFIX = "day4-integration";
const app = createApp();

let categoryId: string;
let warehouseId: string;
const createdProductIds: string[] = [];
const createdVariantIds: string[] = [];
const createdOrderIds: string[] = [];
const createdUserEmails: string[] = [];

beforeAll(async () => {
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  categoryId = category.id;
  const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { isActive: true } });
  warehouseId = warehouse.id;
});

afterAll(async () => {
  if (createdOrderIds.length > 0) {
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } }); // cascades OrderItem
  }
  if (createdVariantIds.length > 0) {
    await prisma.cartItem.deleteMany({ where: { variantId: { in: createdVariantIds } } }); // FK is RESTRICT, must clear first
    await prisma.productVariant.deleteMany({ where: { id: { in: createdVariantIds } } }); // cascades Inventory
  }
  if (createdProductIds.length > 0) {
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
  }
  if (createdUserEmails.length > 0) {
    await prisma.user.deleteMany({ where: { email: { in: createdUserEmails } } });
  }
  await prisma.$disconnect();
});

/** Registers a real account and returns an authenticated agent (Authorization set as a default header, same pattern coupons/returns' own integration tests use). */
async function registerTestUser(): Promise<{ agent: ReturnType<typeof request.agent>; userId: string; email: string }> {
  const email = `${TEST_PREFIX}-${crypto.randomUUID()}@test.woobe.internal`;
  createdUserEmails.push(email);
  const registerRes = await request(app).post("/api/v1/auth/register").send({ name: "Claim Tester", email, password: "Passw0rd1" });
  if (registerRes.status !== 201) throw new Error(`test setup: register failed: ${JSON.stringify(registerRes.body)}`);
  const agent = request.agent(app).set("Authorization", `Bearer ${registerRes.body.accessToken as string}`);
  return { agent, userId: registerRes.body.user.id as string, email };
}

/** Creates a real, active product/variant/inventory row so checkout's live reads (products, pricing, inventory) resolve for real — not mocked. */
async function createTestVariant(params: { weightGrams: number; quantityAvailable: number }): Promise<{
  variantId: string;
  sku: string;
}> {
  const suffix = crypto.randomUUID().slice(0, 8);
  const product = await prisma.product.create({
    data: { name: `${TEST_PREFIX} Product ${suffix}`, slug: `${TEST_PREFIX}-${suffix}`, categoryId, isActive: true },
  });
  createdProductIds.push(product.id);

  const sku = `${TEST_PREFIX}-${suffix}`;
  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      sku,
      color: "Black",
      size: "M",
      weightGrams: params.weightGrams,
      isActive: true,
    },
  });
  createdVariantIds.push(variant.id);

  await prisma.inventory.create({
    data: { variantId: variant.id, warehouseId, quantityAvailable: params.quantityAvailable, quantityReserved: 0 },
  });

  return { variantId: variant.id, sku };
}

const checkoutAddress = {
  fullName: "Test Buyer",
  phone: "9876543210",
  line1: "123 Test Street",
  city: "Bengaluru",
  state: "Karnataka",
  pincode: "560001",
};

describe("checkout: full price/tax/shipping snapshot", () => {
  it("creates an order whose snapshot matches live settings at checkout time, independent of the product row", async () => {
    // 1200g clears the 1000g minimum but sits under the 1500g free-delivery
    // threshold (seeded ADR-021 defaults) — exercises the standard-fee band.
    // Quantity 1 keeps the cart's TOTAL weight in that band too (2× would push it past 1500g).
    const { variantId, sku } = await createTestVariant({ weightGrams: 1200, quantityAvailable: 5 });

    const agent = request.agent(app);
    const addRes = await agent.post("/api/v1/cart/items").send({ variantId, quantity: 1 });
    expect(addRes.status).toBe(200);

    const checkoutRes = await agent.post("/api/v1/orders/checkout").send({
      contactEmail: "buyer@test.woobe.internal",
      confirmEmail: "buyer@test.woobe.internal",
      address: checkoutAddress,
      paymentMethod: "COD",
    });

    expect(checkoutRes.status).toBe(201);
    createdOrderIds.push(checkoutRes.body.id);

    // Independently recompute the expected snapshot from the SAME live
    // settings rows checkout reads, rather than hardcoding numbers that
    // would silently go stale if the seed data ever changes.
    const rate = await prisma.pricingSetting.findFirstOrThrow({ orderBy: { effectiveFrom: "desc" } });
    const gstSlabs = await prisma.gstSlab.findMany();
    const shippingRule = await prisma.shippingRule.findFirstOrThrow({ orderBy: { effectiveFrom: "desc" } });

    const unitPricePaise = Math.round((1200 * rate.defaultRatePerKgPaise) / 1000);
    const lineTotalPaise = unitPricePaise * 1;
    const sortedSlabs = [...gstSlabs].sort((a, b) => (a.maxPricePaise ?? Infinity) - (b.maxPricePaise ?? Infinity));
    const applicableSlab = sortedSlabs.find((s) => s.maxPricePaise === null || unitPricePaise <= s.maxPricePaise);
    if (!applicableSlab) throw new Error("test setup: no GST slab covers the test unit price");
    const taxPaise = Math.round(lineTotalPaise * (applicableSlab.ratePercent / 100));
    const expectedShippingFee = shippingRule.standardFeePaise; // 1200g is between minimum and free-delivery threshold

    const order = checkoutRes.body;
    expect(order.status).toBe("PENDING_PAYMENT");
    expect(order.paymentMethod).toBe("COD");
    expect(order.totalWeightGrams).toBe(1200);
    expect(order.subtotalPaise).toBe(lineTotalPaise);
    expect(order.taxPaise).toBe(taxPaise);
    expect(order.shippingFeePaise).toBe(expectedShippingFee);
    expect(order.totalPaise).toBe(lineTotalPaise + taxPaise + expectedShippingFee);
    expect(order.items).toHaveLength(1);
    expect(order.items[0].skuSnapshot).toBe(sku);
    expect(order.items[0].quantity).toBe(1);
    expect(order.items[0].unitPricePaise).toBe(unitPricePaise);

    // The row in the database, not just the HTTP response — the snapshot is
    // what's actually persisted, independent of current product/pricing state.
    const persisted = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
    expect(persisted.totalPaise).toBe(order.totalPaise);
    expect(persisted.shippingSnapshot).toMatchObject({ city: "Bengaluru", pincode: "560001" });
  });

  it("Week 3 Day 2: ignores client-supplied price/shipping/tax/total fields entirely — server recomputes every one", async () => {
    const { variantId } = await createTestVariant({ weightGrams: 1200, quantityAvailable: 5 });

    const agent = request.agent(app);
    await agent.post("/api/v1/cart/items").send({ variantId, quantity: 1 });

    // A hostile or buggy client stuffing every authoritative financial field
    // it can think of into the checkout body, all wildly wrong — Zod's
    // checkoutSchema doesn't declare any of these keys, so `validate`
    // middleware strips them from req.body before CheckoutUseCase ever runs
    // (DEVELOPMENT_RULES.md #1: nothing client-sent is ever trusted).
    const res = await agent.post("/api/v1/orders/checkout").send({
      contactEmail: "buyer@test.woobe.internal",
      confirmEmail: "buyer@test.woobe.internal",
      address: checkoutAddress,
      paymentMethod: "COD",
      subtotalPaise: 1,
      taxPaise: 0,
      shippingFeePaise: 0,
      discountPaise: 999_999_99,
      totalPaise: 1,
      unitPricePaise: 1,
    });

    expect(res.status).toBe(201);
    createdOrderIds.push(res.body.id);

    const rate = await prisma.pricingSetting.findFirstOrThrow({ orderBy: { effectiveFrom: "desc" } });
    const expectedUnitPricePaise = Math.round((1200 * rate.defaultRatePerKgPaise) / 1000);

    // None of the attacker-supplied values survived — every one is server-computed.
    expect(res.body.discountPaise).toBe(0);
    expect(res.body.shippingFeePaise).toBeGreaterThan(0);
    expect(res.body.taxPaise).toBeGreaterThan(0);
    expect(res.body.subtotalPaise).toBe(expectedUnitPricePaise);
    expect(res.body.totalPaise).toBe(res.body.subtotalPaise + res.body.taxPaise + res.body.shippingFeePaise);
    expect(res.body.items[0].unitPricePaise).toBe(expectedUnitPricePaise);

    const persisted = await prisma.order.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(persisted.totalPaise).toBe(res.body.totalPaise);
    expect(persisted.discountPaise).toBe(0);
  });

  it("blocks checkout below the ADR-021 minimum order weight", async () => {
    const { variantId } = await createTestVariant({ weightGrams: 200, quantityAvailable: 5 });

    const agent = request.agent(app);
    await agent.post("/api/v1/cart/items").send({ variantId, quantity: 1 });

    const res = await agent
      .post("/api/v1/orders/checkout")
      .send({
        contactEmail: "buyer@test.woobe.internal",
        confirmEmail: "buyer@test.woobe.internal",
        address: checkoutAddress,
        paymentMethod: "COD",
      });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("UNPROCESSABLE_ENTITY");
  });

  it("rejects checkout on an empty cart", async () => {
    const agent = request.agent(app);
    // Force cart creation without adding anything: hit GET /cart once to establish a guest cart cookie.
    await agent.get("/api/v1/cart");

    const res = await agent
      .post("/api/v1/orders/checkout")
      .send({
        contactEmail: "buyer@test.woobe.internal",
        confirmEmail: "buyer@test.woobe.internal",
        address: checkoutAddress,
        paymentMethod: "COD",
      });

    expect(res.status).toBe(422);
  });

  it("rejects checkout when a cart item's product/variant is deactivated after it was already added", async () => {
    // AddItemUseCase already refuses to add an inactive variant (404) — this
    // is the OTHER path: valid at add-to-cart time, deactivated by an admin
    // while it sits in the bag. Checkout must re-check live state, not
    // trust whatever was true when the item was added.
    const { variantId } = await createTestVariant({ weightGrams: 1200, quantityAvailable: 5 });

    const agent = request.agent(app);
    const addRes = await agent.post("/api/v1/cart/items").send({ variantId, quantity: 1 });
    expect(addRes.status).toBe(200);

    await prisma.productVariant.update({ where: { id: variantId }, data: { isActive: false } });

    const res = await agent.post("/api/v1/orders/checkout").send({
      contactEmail: "buyer@test.woobe.internal",
      confirmEmail: "buyer@test.woobe.internal",
      address: checkoutAddress,
      paymentMethod: "COD",
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    // Confirm this didn't half-succeed — no order, nothing reserved.
    const orderCount = await prisma.order.count({ where: { items: { some: { variantId } } } });
    expect(orderCount).toBe(0);
  });

  it("rejects checkout when stock drops below the cart's requested quantity after it was already added", async () => {
    // No race here (single request) — proves the plain, non-concurrent
    // insufficient-stock path independently of the concurrency describe
    // block below.
    const { variantId } = await createTestVariant({ weightGrams: 1200, quantityAvailable: 3 });

    const agent = request.agent(app);
    const addRes = await agent.post("/api/v1/cart/items").send({ variantId, quantity: 3 });
    expect(addRes.status).toBe(200);

    // Simulate stock depletion by another sale between add-to-cart and checkout.
    await prisma.inventory.updateMany({ where: { variantId }, data: { quantityAvailable: 1 } });

    const res = await agent.post("/api/v1/orders/checkout").send({
      contactEmail: "buyer@test.woobe.internal",
      confirmEmail: "buyer@test.woobe.internal",
      address: checkoutAddress,
      paymentMethod: "COD",
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    const orderCount = await prisma.order.count({ where: { items: { some: { variantId } } } });
    expect(orderCount).toBe(0);
    // Nothing reserved from the failed attempt.
    const inventory = await prisma.inventory.findFirstOrThrow({ where: { variantId } });
    expect(inventory.quantityReserved).toBe(0);
  });
});

describe("checkout: concurrent reservation (ADR-015)", () => {
  it("only one of two near-simultaneous checkouts succeeds on a stock=1 item", async () => {
    const { variantId } = await createTestVariant({ weightGrams: 1200, quantityAvailable: 1 });

    const agentA = request.agent(app);
    const agentB = request.agent(app);
    await agentA.post("/api/v1/cart/items").send({ variantId, quantity: 1 });
    await agentB.post("/api/v1/cart/items").send({ variantId, quantity: 1 });

    const body = {
      contactEmail: "buyer@test.woobe.internal",
      confirmEmail: "buyer@test.woobe.internal",
      address: checkoutAddress,
      paymentMethod: "COD" as const,
    };
    const [resA, resB] = await Promise.all([
      agentA.post("/api/v1/orders/checkout").send(body),
      agentB.post("/api/v1/orders/checkout").send(body),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 409]);

    const winner = resA.status === 201 ? resA : resB;
    createdOrderIds.push(winner.body.id);

    const loser = resA.status === 201 ? resB : resA;
    expect(loser.body.error.code).toBe("CONFLICT");

    // Exactly one unit reserved, not zero and not two.
    const inventory = await prisma.inventory.findFirstOrThrow({ where: { variantId } });
    expect(inventory.quantityReserved).toBe(1);
    expect(inventory.quantityAvailable).toBe(1); // reservation, not deduction — Day 4 scope (see journal)

    const orderCount = await prisma.order.count({ where: { items: { some: { variantId } } } });
    expect(orderCount).toBe(1);
  });
});

describe("checkout: duplicate-checkout concurrency (Week 3 Day 1 hardening)", () => {
  it("only one of two simultaneous checkouts for the SAME cart succeeds — plenty of stock for both", async () => {
    // Deliberately generous stock (10, for 2 requested) — this isolates the
    // cart-lock fix from ADR-015's separate stock-scarcity guard above:
    // if stock alone were the reason only one succeeds, that wouldn't prove
    // the SAME-cart race is actually closed.
    const { variantId } = await createTestVariant({ weightGrams: 1200, quantityAvailable: 10 });

    const agent = request.agent(app); // ONE cart for both concurrent requests
    await agent.post("/api/v1/cart/items").send({ variantId, quantity: 1 });

    const body = {
      contactEmail: "dup-checkout@test.woobe.internal",
      confirmEmail: "dup-checkout@test.woobe.internal",
      address: checkoutAddress,
      paymentMethod: "COD" as const,
    };
    const [resA, resB] = await Promise.all([
      agent.post("/api/v1/orders/checkout").send(body),
      agent.post("/api/v1/orders/checkout").send(body),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 409]);

    const winner = resA.status === 201 ? resA : resB;
    createdOrderIds.push(winner.body.id);

    const loser = resA.status === 201 ? resB : resA;
    expect(loser.body.error.code).toBe("CONFLICT");

    // Exactly one order, exactly one unit reserved — not two of either.
    const orderCount = await prisma.order.count({ where: { items: { some: { variantId } } } });
    expect(orderCount).toBe(1);
    const inventory = await prisma.inventory.findFirstOrThrow({ where: { variantId } });
    expect(inventory.quantityReserved).toBe(1);

    const cart = await prisma.cart.findFirstOrThrow({ where: { items: { some: { variantId } } } });
    expect(cart.status).toBe("CONVERTED");
  });
});

describe("checkout: guest email confirmation (client-review fix, 2026-09-03)", () => {
  it("rejects a guest checkout with no confirmEmail at all", async () => {
    const { variantId } = await createTestVariant({ weightGrams: 1200, quantityAvailable: 5 });
    const agent = request.agent(app);
    await agent.post("/api/v1/cart/items").send({ variantId, quantity: 1 });

    const res = await agent
      .post("/api/v1/orders/checkout")
      .send({ contactEmail: "buyer@test.woobe.internal", address: checkoutAddress, paymentMethod: "COD" });

    expect(res.status).toBe(400);
    expect(res.body.error.fieldErrors).toHaveProperty("confirmEmail");
  });

  it("rejects a guest checkout whose confirmEmail doesn't match contactEmail", async () => {
    const { variantId } = await createTestVariant({ weightGrams: 1200, quantityAvailable: 5 });
    const agent = request.agent(app);
    await agent.post("/api/v1/cart/items").send({ variantId, quantity: 1 });

    const res = await agent.post("/api/v1/orders/checkout").send({
      contactEmail: "buyer@test.woobe.internal",
      confirmEmail: "typo@test.woobe.internal",
      address: checkoutAddress,
      paymentMethod: "COD",
    });

    expect(res.status).toBe(400);
    expect(res.body.error.fieldErrors).toHaveProperty("confirmEmail");
  });

  it("does NOT require confirmEmail for a logged-in checkout", async () => {
    const { agent } = await registerTestUser();
    const { variantId } = await createTestVariant({ weightGrams: 1200, quantityAvailable: 5 });
    await agent.post("/api/v1/cart/items").send({ variantId, quantity: 1 });

    const res = await agent
      .post("/api/v1/orders/checkout")
      .send({ contactEmail: "buyer@test.woobe.internal", address: checkoutAddress, paymentMethod: "COD" });

    expect(res.status).toBe(201);
    createdOrderIds.push(res.body.id);
  });
});

describe("guest order claim (client-review fix, 2026-09-03)", () => {
  /** Guest checkout — deliberately a plain, unauthenticated agent, contactEmail independent of any account. */
  async function placeGuestOrder(contactEmail: string): Promise<string> {
    const { variantId } = await createTestVariant({ weightGrams: 1200, quantityAvailable: 5 });
    const agent = request.agent(app);
    await agent.post("/api/v1/cart/items").send({ variantId, quantity: 1 });
    const res = await agent.post("/api/v1/orders/checkout").send({
      contactEmail,
      confirmEmail: contactEmail,
      address: checkoutAddress,
      paymentMethod: "COD",
    });
    expect(res.status).toBe(201);
    createdOrderIds.push(res.body.id);
    return res.body.orderNumber as string;
  }

  it("attaches a matching guest order to the caller's account — covers checking out under one email, registering under a different one", async () => {
    const orderNumber = await placeGuestOrder("gifter@test.woobe.internal");
    const { agent, userId } = await registerTestUser(); // deliberately a DIFFERENT email than the guest order's

    const res = await agent
      .post("/api/v1/orders/claim-guest-order")
      .send({ orderNumber, contactEmail: "gifter@test.woobe.internal" });

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(userId);

    const persisted = await prisma.order.findFirstOrThrow({ where: { orderNumber } });
    expect(persisted.userId).toBe(userId);

    // Now shows up in "My Orders".
    const listRes = await agent.get("/api/v1/orders");
    expect(listRes.body.orders.some((o: { orderNumber: string }) => o.orderNumber === orderNumber)).toBe(true);
  });

  it("accepts a lowercase/mistyped-case order number (normalized server-side)", async () => {
    const orderNumber = await placeGuestOrder("case-test@test.woobe.internal");
    const { agent, userId } = await registerTestUser();

    const res = await agent
      .post("/api/v1/orders/claim-guest-order")
      .send({ orderNumber: orderNumber.toLowerCase(), contactEmail: "case-test@test.woobe.internal" });

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(userId);
  });

  it("404s on a wrong email — does not reveal that the order number itself is valid", async () => {
    const orderNumber = await placeGuestOrder("real-owner@test.woobe.internal");
    const { agent } = await registerTestUser();

    const res = await agent.post("/api/v1/orders/claim-guest-order").send({ orderNumber, contactEmail: "wrong@test.woobe.internal" });

    expect(res.status).toBe(404);
    const persisted = await prisma.order.findFirstOrThrow({ where: { orderNumber } });
    expect(persisted.userId).toBeNull(); // unclaimed, still guest-owned
  });

  it("404s on an unknown order number", async () => {
    const { agent } = await registerTestUser();
    const res = await agent
      .post("/api/v1/orders/claim-guest-order")
      .send({ orderNumber: "WOOBE-20260101-000000000000", contactEmail: "nobody@test.woobe.internal" });
    expect(res.status).toBe(404);
  });

  it("404s on an order that already belongs to a different account — cannot re-claim someone else's order", async () => {
    const orderNumber = await placeGuestOrder("first-claimant@test.woobe.internal");
    const first = await registerTestUser();
    const claimRes = await first.agent
      .post("/api/v1/orders/claim-guest-order")
      .send({ orderNumber, contactEmail: "first-claimant@test.woobe.internal" });
    expect(claimRes.status).toBe(200);

    const second = await registerTestUser();
    const res = await second.agent
      .post("/api/v1/orders/claim-guest-order")
      .send({ orderNumber, contactEmail: "first-claimant@test.woobe.internal" });

    expect(res.status).toBe(404);
    const persisted = await prisma.order.findFirstOrThrow({ where: { orderNumber } });
    expect(persisted.userId).toBe(first.userId); // still the first claimant, untouched
  });

  it("401s when not logged in", async () => {
    const orderNumber = await placeGuestOrder("anon@test.woobe.internal");
    const res = await request(app)
      .post("/api/v1/orders/claim-guest-order")
      .send({ orderNumber, contactEmail: "anon@test.woobe.internal" });
    expect(res.status).toBe(401);
  });
});

describe("Week 3 Day 6: customer order authorization — no IDOR/BOLA", () => {
  it("a logged-in customer cannot fetch another logged-in customer's order by id — 404, not 403 (don't reveal it exists)", async () => {
    const { variantId } = await createTestVariant({ weightGrams: 1200, quantityAvailable: 5 });
    const ownerA = await registerTestUser();
    await ownerA.agent.post("/api/v1/cart/items").send({ variantId, quantity: 1 });
    const checkoutRes = await ownerA.agent.post("/api/v1/orders/checkout").send({
      contactEmail: ownerA.email,
      confirmEmail: ownerA.email,
      address: checkoutAddress,
      paymentMethod: "COD",
    });
    expect(checkoutRes.status).toBe(201);
    createdOrderIds.push(checkoutRes.body.id);

    // The actual owner can view it — establishes the baseline before
    // proving the other account can't.
    const ownRes = await ownerA.agent.get(`/api/v1/orders/${checkoutRes.body.id}`);
    expect(ownRes.status).toBe(200);

    const strangerB = await registerTestUser();
    const strangerRes = await strangerB.agent.get(`/api/v1/orders/${checkoutRes.body.id}`);
    expect(strangerRes.status).toBe(404);
  });

  it("\"My Orders\" is scoped per-account — customer B's list never contains customer A's orders", async () => {
    const { variantId } = await createTestVariant({ weightGrams: 1200, quantityAvailable: 5 });
    const ownerA = await registerTestUser();
    await ownerA.agent.post("/api/v1/cart/items").send({ variantId, quantity: 1 });
    const checkoutRes = await ownerA.agent.post("/api/v1/orders/checkout").send({
      contactEmail: ownerA.email,
      confirmEmail: ownerA.email,
      address: checkoutAddress,
      paymentMethod: "COD",
    });
    expect(checkoutRes.status).toBe(201);
    createdOrderIds.push(checkoutRes.body.id);

    const strangerB = await registerTestUser();
    const listRes = await strangerB.agent.get("/api/v1/orders");
    expect(listRes.status).toBe(200);
    expect(listRes.body.orders.some((o: { id: string }) => o.id === checkoutRes.body.id)).toBe(false);

    // And it DOES show up for the actual owner, for contrast.
    const ownListRes = await ownerA.agent.get("/api/v1/orders");
    expect(ownListRes.body.orders.some((o: { id: string }) => o.id === checkoutRes.body.id)).toBe(true);
  });

  it("an anonymous (logged-out) caller cannot fetch a logged-in customer's order by id either", async () => {
    const { variantId } = await createTestVariant({ weightGrams: 1200, quantityAvailable: 5 });
    const ownerA = await registerTestUser();
    await ownerA.agent.post("/api/v1/cart/items").send({ variantId, quantity: 1 });
    const checkoutRes = await ownerA.agent.post("/api/v1/orders/checkout").send({
      contactEmail: ownerA.email,
      confirmEmail: ownerA.email,
      address: checkoutAddress,
      paymentMethod: "COD",
    });
    expect(checkoutRes.status).toBe(201);
    createdOrderIds.push(checkoutRes.body.id);

    const anonRes = await request(app).get(`/api/v1/orders/${checkoutRes.body.id}`);
    expect(anonRes.status).toBe(404);
  });
});
