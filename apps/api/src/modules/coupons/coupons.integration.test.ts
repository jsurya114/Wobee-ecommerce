import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

/**
 * Integration tests against the REAL test database (see auth's own
 * integration test file for the setup this mirrors — DATABASE_URL points at
 * woobe_test). Every fixture coupon in the customer-facing describe blocks
 * below is still created directly via Prisma (that pipeline never needed
 * to go through the admin API to be tested) — but admin CRUD now exists
 * (client-review, 2026-09-03) and has its own describe block at the bottom
 * of this file, exercising the real `/api/v1/admin/coupons` endpoints.
 *
 * Covers week2 (1).md §9's full validate -> apply -> checkout-redeem
 * pipeline, including its explicitly mandatory "concurrent redemption" test.
 */

const TEST_PREFIX = "day5-coupons-integration";
const app = createApp();

let categoryId: string;
let otherCategoryId: string;
let warehouseId: string;
const createdCategoryIds: string[] = [];
const createdUserIds: string[] = [];
const createdProductIds: string[] = [];
const createdVariantIds: string[] = [];
const createdOrderIds: string[] = [];
const createdCouponIds: string[] = [];

beforeAll(async () => {
  // FIXED, not WEIGHT_BASED (2026-09-02 CI fix): this suite pins an exact
  // known price on every fixture via ProductVariant.fixedPricePaise, which
  // is only authoritative when the product's category is FIXED
  // (resolve-effective-price.ts) — WEIGHT_BASED ignores it and derives price
  // from weightGrams x the live global rate instead, which can only hit an
  // arbitrary round-number price by exact coincidence (globalRatePerKgPaise
  // rarely divides it evenly) and, worse, forces weightGrams down into the
  // tens of grams for a low price target, tripping ADR-021's checkout-wide
  // 1000g minimum (resolve-shipping.ts) that this suite never meant to
  // exercise. FIXED-priced lines don't count toward weightBasedTotalGrams at
  // all (compute-cart-totals.ts), so that minimum can never block them —
  // this is the same category-pricing-mode split real Accessories products
  // use, not a bespoke suite mechanism. Seed only guarantees one FIXED
  // category (Accessories), and this suite's own "matching category only"
  // test needs two, so both are created here rather than borrowed from seed.
  const [category, otherCategory] = await Promise.all([
    prisma.category.create({ data: { name: `${TEST_PREFIX} Category A`, slug: `${TEST_PREFIX}-cat-a`, pricingMode: "FIXED" } }),
    prisma.category.create({ data: { name: `${TEST_PREFIX} Category B`, slug: `${TEST_PREFIX}-cat-b`, pricingMode: "FIXED" } }),
  ]);
  categoryId = category.id;
  otherCategoryId = otherCategory.id;
  createdCategoryIds.push(category.id, otherCategory.id);
  const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { isActive: true } });
  warehouseId = warehouse.id;
});

afterAll(async () => {
  if (createdOrderIds.length > 0) {
    await prisma.couponRedemption.deleteMany({ where: { orderId: { in: createdOrderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } }); // cascades OrderItem
  }
  if (createdCouponIds.length > 0) {
    await prisma.couponRedemption.deleteMany({ where: { couponId: { in: createdCouponIds } } });
    await prisma.coupon.deleteMany({ where: { id: { in: createdCouponIds } } }); // cascades CouponProduct/CouponCategory
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
  if (createdCategoryIds.length > 0) {
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  }
  await prisma.$disconnect();
});

async function createTestVariant(
  params: { weightGrams: number; quantityAvailable: number; pricePaise: number; categoryId?: string } = {
    weightGrams: 1200,
    quantityAvailable: 10,
    pricePaise: 100_00,
  },
): Promise<{ variantId: string; productId: string }> {
  const suffix = crypto.randomUUID().slice(0, 8);
  const product = await prisma.product.create({
    data: {
      name: `${TEST_PREFIX} Product ${suffix}`,
      slug: `${TEST_PREFIX}-${suffix}`,
      categoryId: params.categoryId ?? categoryId,
      isActive: true,
    },
  });
  createdProductIds.push(product.id);

  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      sku: `${TEST_PREFIX}-${suffix}`,
      color: "Black",
      size: "M",
      weightGrams: params.weightGrams,
      // Authoritative price on a FIXED-category variant (see beforeAll) —
      // exact by construction, independent of weight and the live global
      // rate/kg, and immune to ADR-021's weight-based checkout minimum.
      fixedPricePaise: params.pricePaise,
      isActive: true,
    },
  });
  createdVariantIds.push(variant.id);

  await prisma.inventory.create({
    data: { variantId: variant.id, warehouseId, quantityAvailable: params.quantityAvailable, quantityReserved: 0 },
  });

  return { variantId: variant.id, productId: product.id };
}

async function createTestUser(): Promise<{ agent: ReturnType<typeof request.agent>; userId: string }> {
  const email = `${TEST_PREFIX}-${crypto.randomUUID()}@test.woobe.internal`;
  const registerRes = await request(app).post("/api/v1/auth/register").send({ name: "Coupon Tester", email, password: "Passw0rd" });
  if (registerRes.status !== 201) throw new Error(`test setup: register failed: ${JSON.stringify(registerRes.body)}`);
  createdUserIds.push(registerRes.body.user.id);

  const agent = request.agent(app);
  // supertest's agent doesn't auto-attach a bearer token the way it does
  // cookies — every authenticated call below sets it explicitly via
  // .set("Authorization", ...), using this stored token.
  return { agent: agent.set("Authorization", `Bearer ${registerRes.body.accessToken as string}`), userId: registerRes.body.user.id };
}

async function createCoupon(overrides: Partial<Parameters<typeof prisma.coupon.create>[0]["data"]> = {}): Promise<string> {
  const code = `${TEST_PREFIX.toUpperCase().replace(/-/g, "")}${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const coupon = await prisma.coupon.create({
    data: {
      code,
      type: "PERCENTAGE",
      value: 10,
      validFrom: new Date("2020-01-01"),
      validTo: new Date("2999-01-01"),
      isActive: true,
      ...overrides,
    },
  });
  createdCouponIds.push(coupon.id);
  return coupon.code;
}

const checkoutAddress = {
  fullName: "Test Buyer",
  phone: "9876543210",
  line1: "123 Test Street",
  city: "Bengaluru",
  state: "Karnataka",
  pincode: "560001",
};

describe("coupons: cart preview + apply/remove", () => {
  it("applies a valid coupon and reflects the live discount on the cart", async () => {
    const { agent } = await createTestUser();
    const { variantId } = await createTestVariant({ weightGrams: 1200, quantityAvailable: 5, pricePaise: 100_00 });
    const code = await createCoupon({ type: "PERCENTAGE", value: 10 });

    await agent.post("/api/v1/cart/items").send({ variantId, quantity: 1 });
    const applyRes = await agent.post("/api/v1/cart/coupon").send({ code });

    expect(applyRes.status).toBe(200);
    expect(applyRes.body.appliedCoupon).toMatchObject({ code, isValid: true });
    expect(applyRes.body.discountPaise).toBe(1000); // 10% of 100_00

    const getRes = await agent.get("/api/v1/cart");
    expect(getRes.body.discountPaise).toBe(1000);
  });

  it("rejects applying an unknown coupon code", async () => {
    const { agent } = await createTestUser();
    const { variantId } = await createTestVariant();
    await agent.post("/api/v1/cart/items").send({ variantId, quantity: 1 });

    const res = await agent.post("/api/v1/cart/coupon").send({ code: "DOES-NOT-EXIST" });
    expect(res.status).toBe(422);
  });

  it("rejects an expired coupon", async () => {
    const { agent } = await createTestUser();
    const { variantId } = await createTestVariant();
    await agent.post("/api/v1/cart/items").send({ variantId, quantity: 1 });
    const code = await createCoupon({ validFrom: new Date("2000-01-01"), validTo: new Date("2000-06-01") });

    const res = await agent.post("/api/v1/cart/coupon").send({ code });
    expect(res.status).toBe(422);
  });

  it("rejects when the cart is under the coupon's minimum order value", async () => {
    const { agent } = await createTestUser();
    const { variantId } = await createTestVariant({ weightGrams: 1200, quantityAvailable: 5, pricePaise: 50_00 });
    await agent.post("/api/v1/cart/items").send({ variantId, quantity: 1 });
    const code = await createCoupon({ minCartValuePaise: 100_00 });

    const res = await agent.post("/api/v1/cart/coupon").send({ code });
    expect(res.status).toBe(422);
  });

  it("restricts the discount to matching products only", async () => {
    const { agent } = await createTestUser();
    const { variantId: matchingVariantId, productId: matchingProductId } = await createTestVariant({
      weightGrams: 600,
      quantityAvailable: 5,
      pricePaise: 60_00,
    });
    const { variantId: otherVariantId } = await createTestVariant({ weightGrams: 600, quantityAvailable: 5, pricePaise: 40_00 });
    const code = await createCoupon({ type: "PERCENTAGE", value: 50, products: { create: { productId: matchingProductId } } });

    await agent.post("/api/v1/cart/items").send({ variantId: matchingVariantId, quantity: 1 });
    await agent.post("/api/v1/cart/items").send({ variantId: otherVariantId, quantity: 1 });

    const res = await agent.post("/api/v1/cart/coupon").send({ code });
    expect(res.status).toBe(200);
    // 50% of only the matching product's 60_00 line, not the full 100_00 cart.
    expect(res.body.discountPaise).toBe(3000);
  });

  it("restricts the discount to matching categories only", async () => {
    const { agent } = await createTestUser();
    const { variantId: matchingVariantId } = await createTestVariant({
      weightGrams: 600,
      quantityAvailable: 5,
      pricePaise: 60_00,
      categoryId,
    });
    const { variantId: otherVariantId } = await createTestVariant({
      weightGrams: 600,
      quantityAvailable: 5,
      pricePaise: 40_00,
      categoryId: otherCategoryId,
    });
    const code = await createCoupon({ type: "PERCENTAGE", value: 50, categories: { create: { categoryId } } });

    await agent.post("/api/v1/cart/items").send({ variantId: matchingVariantId, quantity: 1 });
    await agent.post("/api/v1/cart/items").send({ variantId: otherVariantId, quantity: 1 });

    const res = await agent.post("/api/v1/cart/coupon").send({ code });
    expect(res.status).toBe(200);
    expect(res.body.discountPaise).toBe(3000);
  });

  it("rejects re-applying a coupon once its per-user limit is exhausted", async () => {
    const { agent, userId } = await createTestUser();
    const { variantId } = await createTestVariant({ weightGrams: 1200, quantityAvailable: 5, pricePaise: 100_00 });
    const code = await createCoupon({ perUserLimit: 1 });
    const coupon = await prisma.coupon.findUniqueOrThrow({ where: { code } });

    // Simulate one prior redemption directly (no order needed for this check
    // — RedeemCouponUseCase only counts CouponRedemption rows).
    const priorOrder = await prisma.order.create({
      data: {
        orderNumber: `${TEST_PREFIX}-PRIOR-${crypto.randomUUID().slice(0, 8)}`,
        userId,
        contactName: "x",
        contactPhone: "9876543210",
        contactEmail: "x@test.woobe.internal",
        shippingSnapshot: checkoutAddress,
        subtotalPaise: 100_00,
        discountPaise: 1000,
        shippingFeePaise: 0,
        taxPaise: 0,
        totalPaise: 99_00,
        totalWeightGrams: 1200,
        paymentMethod: "COD",
      },
    });
    createdOrderIds.push(priorOrder.id);
    await prisma.couponRedemption.create({ data: { couponId: coupon.id, userId, orderId: priorOrder.id } });

    await agent.post("/api/v1/cart/items").send({ variantId, quantity: 1 });
    const res = await agent.post("/api/v1/cart/coupon").send({ code });
    expect(res.status).toBe(422);
  });

  it("removes an applied coupon", async () => {
    const { agent } = await createTestUser();
    const { variantId } = await createTestVariant({ weightGrams: 1200, quantityAvailable: 5, pricePaise: 100_00 });
    const code = await createCoupon();

    await agent.post("/api/v1/cart/items").send({ variantId, quantity: 1 });
    await agent.post("/api/v1/cart/coupon").send({ code });

    const removeRes = await agent.delete("/api/v1/cart/coupon");
    expect(removeRes.status).toBe(200);
    expect(removeRes.body.appliedCoupon).toBeNull();
    expect(removeRes.body.discountPaise).toBe(0);
  });
});

describe("coupons: checkout redemption", () => {
  it("redeems the coupon at checkout — order carries the real discount and a CouponRedemption row is created", async () => {
    const { agent, userId } = await createTestUser();
    const { variantId } = await createTestVariant({ weightGrams: 1200, quantityAvailable: 5, pricePaise: 100_00 });
    const code = await createCoupon({ type: "PERCENTAGE", value: 10 });

    await agent.post("/api/v1/cart/items").send({ variantId, quantity: 1 });
    await agent.post("/api/v1/cart/coupon").send({ code });

    const checkoutRes = await agent.post("/api/v1/orders/checkout").send({
      contactEmail: "buyer@test.woobe.internal",
      address: checkoutAddress,
      paymentMethod: "COD",
    });

    expect(checkoutRes.status).toBe(201);
    createdOrderIds.push(checkoutRes.body.id);
    expect(checkoutRes.body.discountPaise).toBe(1000);
    expect(checkoutRes.body.totalPaise).toBe(checkoutRes.body.subtotalPaise + checkoutRes.body.taxPaise + checkoutRes.body.shippingFeePaise - 1000);

    const coupon = await prisma.coupon.findUniqueOrThrow({ where: { code } });
    const redemption = await prisma.couponRedemption.findUnique({ where: { orderId: checkoutRes.body.id } });
    expect(redemption).toMatchObject({ couponId: coupon.id, userId });

    // The cart's couponCode is cleared once converted (own fix, this Day 5
    // session) — a future cart for this user must not silently inherit it.
    const cart = await prisma.cart.findUniqueOrThrow({ where: { userId } });
    expect(cart.couponCode).toBeNull();
  });

  it("rejects checkout (rolling back the whole transaction) once the coupon's usage limit is exhausted by a concurrent checkout", async () => {
    const buyerA = await createTestUser();
    const buyerB = await createTestUser();
    const { variantId: variantA } = await createTestVariant({ weightGrams: 1200, quantityAvailable: 5, pricePaise: 100_00 });
    const { variantId: variantB } = await createTestVariant({ weightGrams: 1200, quantityAvailable: 5, pricePaise: 100_00 });
    const code = await createCoupon({ usageLimit: 1 });

    await buyerA.agent.post("/api/v1/cart/items").send({ variantId: variantA, quantity: 1 });
    await buyerA.agent.post("/api/v1/cart/coupon").send({ code });
    await buyerB.agent.post("/api/v1/cart/items").send({ variantId: variantB, quantity: 1 });
    await buyerB.agent.post("/api/v1/cart/coupon").send({ code });

    const body = { contactEmail: "buyer@test.woobe.internal", address: checkoutAddress, paymentMethod: "COD" as const };
    const [resA, resB] = await Promise.all([
      buyerA.agent.post("/api/v1/orders/checkout").send(body),
      buyerB.agent.post("/api/v1/orders/checkout").send(body),
    ]);

    const statuses = [resA.status, resB.status].sort();
    // One checkout succeeds at full redemption; the other's coupon lock sees
    // the limit already hit and rolls back the ENTIRE checkout transaction
    // (not just the coupon step) — a 422 here, not a 201-without-discount.
    expect(statuses).toEqual([201, 422]);

    const winner = resA.status === 201 ? resA : resB;
    createdOrderIds.push(winner.body.id);
    expect(winner.body.discountPaise).toBeGreaterThan(0);

    const loser = resA.status === 201 ? resB : resA;
    // The loser's inventory reservation and cart-conversion must also have
    // rolled back — nothing partially committed for a checkout that failed.
    const loserOrderCount = await prisma.order.count({ where: { userId: loser === resA ? buyerA.userId : buyerB.userId } });
    expect(loserOrderCount).toBe(0);

    const coupon = await prisma.coupon.findUniqueOrThrow({ where: { code } });
    const redemptionCount = await prisma.couponRedemption.count({ where: { couponId: coupon.id } });
    expect(redemptionCount).toBe(1);
  });

  it("splits the discount across multiple lines and recalculates tax on the discounted value", async () => {
    const { agent } = await createTestUser();
    const { variantId: v1 } = await createTestVariant({ weightGrams: 600, quantityAvailable: 5, pricePaise: 60_00 });
    const { variantId: v2 } = await createTestVariant({ weightGrams: 600, quantityAvailable: 5, pricePaise: 40_00 });
    const code = await createCoupon({ type: "PERCENTAGE", value: 10 });

    await agent.post("/api/v1/cart/items").send({ variantId: v1, quantity: 1 });
    await agent.post("/api/v1/cart/items").send({ variantId: v2, quantity: 1 });
    await agent.post("/api/v1/cart/coupon").send({ code });

    const checkoutRes = await agent.post("/api/v1/orders/checkout").send({
      contactEmail: "buyer@test.woobe.internal",
      address: checkoutAddress,
      paymentMethod: "COD",
    });

    expect(checkoutRes.status).toBe(201);
    createdOrderIds.push(checkoutRes.body.id);
    // 10% of a 100_00 cart-wide-eligible total = 1000 paise total discount.
    expect(checkoutRes.body.discountPaise).toBe(1000);
    // subtotalPaise stays the full, undiscounted line total (schema has no
    // per-line discount column — only taxPaise reflects the discount).
    expect(checkoutRes.body.subtotalPaise).toBe(100_00);

    const persisted = await prisma.order.findUniqueOrThrow({ where: { id: checkoutRes.body.id }, include: { items: true } });
    const taxFromItems = persisted.items.reduce((sum, item) => sum + item.taxAmountPaise, 0);
    expect(taxFromItems).toBe(checkoutRes.body.taxPaise);
    // Every line's tax must be strictly less than what it would be on the
    // undiscounted amount, since each line got some share of the discount.
    for (const item of persisted.items) {
      expect(item.taxAmountPaise).toBeLessThan(item.lineTotalPaise); // sanity: GST slabs here are well under 100%
    }

    // Week 3 Day 9 — "Coupon + shipping + tax" combined, and the full
    // financial-reconciliation formula, not just the pieces this test
    // already checked individually. Both fixture lines are FIXED-priced —
    // zero weight-based grams, so shipping never meets the free-delivery
    // threshold (ADR-021) and lands on the live rule's flat standard fee,
    // fetched live rather than hardcoded (same "recompute from live
    // settings" discipline Day 1's own reconciliation test uses).
    const shippingRule = await prisma.shippingRule.findFirstOrThrow({ orderBy: { effectiveFrom: "desc" } });
    expect(checkoutRes.body.shippingFeePaise).toBe(shippingRule.standardFeePaise);
    expect(persisted.shippingFeePaise).toBe(shippingRule.standardFeePaise);
    expect(checkoutRes.body.totalPaise).toBe(
      checkoutRes.body.subtotalPaise + checkoutRes.body.shippingFeePaise + checkoutRes.body.taxPaise - checkoutRes.body.discountPaise,
    );
    expect(persisted.totalPaise).toBe(checkoutRes.body.totalPaise);
  });
});

async function loginAdmin(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/v1/admin/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

function futureCode(suffix: string): string {
  return `${TEST_PREFIX.toUpperCase().replace(/-/g, "")}${suffix}`;
}

describe("admin coupon management (client-review, 2026-09-03)", () => {
  it("403s a role without MANAGE_CATALOG (order_processing_staff)", async () => {
    const token = await loginAdmin("orders@woobe.in", "Staff@12345");
    const res = await request(app).get("/api/v1/admin/coupons").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("allows product_management_staff (has MANAGE_CATALOG)", async () => {
    const token = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const res = await request(app).get("/api/v1/admin/coupons").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.coupons)).toBe(true);
  });

  it("creates a PERCENTAGE coupon, capped by maxDiscountPaise, and it appears in the list with redemptionCount 0", async () => {
    const token = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${token}` };
    const code = futureCode("PCT1");

    const createRes = await request(app)
      .post("/api/v1/admin/coupons")
      .set(auth)
      .send({
        code,
        type: "PERCENTAGE",
        value: 15,
        maxDiscountPaise: 50000,
        usageLimit: 100,
        perUserLimit: 1,
        validFrom: "2020-01-01T00:00:00.000Z",
        validTo: "2999-01-01T00:00:00.000Z",
      });
    expect(createRes.status).toBe(201);
    createdCouponIds.push(createRes.body.coupon.id);
    expect(createRes.body.coupon).toMatchObject({ code, type: "PERCENTAGE", value: 15, maxDiscountPaise: 50000, isActive: true, redemptionCount: 0 });

    const getRes = await request(app).get(`/api/v1/admin/coupons/${createRes.body.coupon.id}`).set(auth);
    expect(getRes.status).toBe(200);
    expect(getRes.body.coupon.code).toBe(code);

    const listRes = await request(app).get("/api/v1/admin/coupons").set(auth);
    expect(listRes.body.coupons.some((c: { code: string }) => c.code === code)).toBe(true);
  });

  it("creates a FLAT coupon", async () => {
    const token = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const code = futureCode("FLAT1");

    const res = await request(app)
      .post("/api/v1/admin/coupons")
      .set("Authorization", `Bearer ${token}`)
      .send({ code, type: "FLAT", value: 10000, validFrom: "2020-01-01T00:00:00.000Z", validTo: "2999-01-01T00:00:00.000Z" });
    expect(res.status).toBe(201);
    createdCouponIds.push(res.body.coupon.id);
    expect(res.body.coupon).toMatchObject({ code, type: "FLAT", value: 10000, maxDiscountPaise: null });
  });

  it("rejects a duplicate code with 409, not a raw 500", async () => {
    const token = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${token}` };
    const code = await createCoupon();

    const res = await request(app)
      .post("/api/v1/admin/coupons")
      .set(auth)
      .send({ code, type: "FLAT", value: 500, validFrom: "2020-01-01T00:00:00.000Z", validTo: "2999-01-01T00:00:00.000Z" });
    expect(res.status).toBe(409);
  });

  it.each([
    ["a PERCENTAGE value over 100", { type: "PERCENTAGE", value: 150 }],
    ["a PERCENTAGE value under 1", { type: "PERCENTAGE", value: 0 }],
    ["a non-positive FLAT value", { type: "FLAT", value: 0 }],
    ["an expiry before the start date", { type: "FLAT", value: 100, validFrom: "2026-06-01T00:00:00.000Z", validTo: "2020-01-01T00:00:00.000Z" }],
    ["a per-user limit above the overall usage limit", { type: "FLAT", value: 100, usageLimit: 5, perUserLimit: 6 }],
    ["a maxDiscountPaise on a FLAT coupon", { type: "FLAT", value: 100, maxDiscountPaise: 500 }],
  ])("rejects creating a coupon with %s (400, not a raw 500)", async (_label, overrides) => {
    const token = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const res = await request(app)
      .post("/api/v1/admin/coupons")
      .set("Authorization", `Bearer ${token}`)
      .send({
        code: futureCode(`BAD${crypto.randomUUID().slice(0, 6)}`),
        validFrom: "2020-01-01T00:00:00.000Z",
        validTo: "2999-01-01T00:00:00.000Z",
        ...overrides,
      });
    expect(res.status).toBe(400);
  });

  it("validates an update against the MERGED shape, not just the fields resent (perUserLimit alone, checked against the coupon's existing usageLimit)", async () => {
    const token = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${token}` };
    const createRes = await request(app)
      .post("/api/v1/admin/coupons")
      .set(auth)
      .send({
        code: futureCode("MERGE1"),
        type: "FLAT",
        value: 100,
        usageLimit: 5,
        validFrom: "2020-01-01T00:00:00.000Z",
        validTo: "2999-01-01T00:00:00.000Z",
      });
    expect(createRes.status).toBe(201);
    createdCouponIds.push(createRes.body.coupon.id);

    // perUserLimit alone in this request — usageLimit (5) comes from the existing row.
    const badUpdate = await request(app).patch(`/api/v1/admin/coupons/${createRes.body.coupon.id}`).set(auth).send({ perUserLimit: 6 });
    expect(badUpdate.status).toBe(400);

    const goodUpdate = await request(app).patch(`/api/v1/admin/coupons/${createRes.body.coupon.id}`).set(auth).send({ perUserLimit: 5, value: 200 });
    expect(goodUpdate.status).toBe(200);
    expect(goodUpdate.body.coupon).toMatchObject({ perUserLimit: 5, value: 200, usageLimit: 5 });
  });

  it("deactivating a coupon makes it immediately unusable at cart-apply, and reactivating restores it", async () => {
    const adminToken = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const code = await createCoupon();
    const { agent } = await createTestUser();
    const { variantId } = await createTestVariant();
    await agent.post("/api/v1/cart/items").send({ variantId, quantity: 1 });

    const beforeRes = await agent.post("/api/v1/cart/coupon").send({ code });
    expect(beforeRes.status).toBe(200);
    await agent.delete("/api/v1/cart/coupon"); // clean slate before re-applying below

    const couponId = (await prisma.coupon.findUniqueOrThrow({ where: { code } })).id;
    const deactivateRes = await request(app)
      .post(`/api/v1/admin/coupons/${couponId}/active`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: false });
    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.coupon.isActive).toBe(false);

    const afterDeactivateRes = await agent.post("/api/v1/cart/coupon").send({ code });
    expect(afterDeactivateRes.status).toBe(422); // ineligible — same "invalid coupon" path a customer sees for any other ineligibility reason

    const reactivateRes = await request(app)
      .post(`/api/v1/admin/coupons/${couponId}/active`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: true });
    expect(reactivateRes.status).toBe(200);
    const afterReactivateRes = await agent.post("/api/v1/cart/coupon").send({ code });
    expect(afterReactivateRes.status).toBe(200);
  });

  it("deletes a never-redeemed coupon", async () => {
    const token = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${token}` };
    const createRes = await request(app)
      .post("/api/v1/admin/coupons")
      .set(auth)
      .send({ code: futureCode("DEL1"), type: "FLAT", value: 100, validFrom: "2020-01-01T00:00:00.000Z", validTo: "2999-01-01T00:00:00.000Z" });
    expect(createRes.status).toBe(201);

    const deleteRes = await request(app).delete(`/api/v1/admin/coupons/${createRes.body.coupon.id}`).set(auth);
    expect(deleteRes.status).toBe(204);

    const getRes = await request(app).get(`/api/v1/admin/coupons/${createRes.body.coupon.id}`).set(auth);
    expect(getRes.status).toBe(404);
  });

  it("refuses to delete a coupon that has real redemption history — 409, prefer deactivate", async () => {
    const token = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${token}` };
    const code = await createCoupon({ type: "FLAT", value: 1000 });
    const couponId = (await prisma.coupon.findUniqueOrThrow({ where: { code } })).id;

    const { agent } = await createTestUser();
    const { variantId } = await createTestVariant();
    await agent.post("/api/v1/cart/items").send({ variantId, quantity: 1 });
    await agent.post("/api/v1/cart/coupon").send({ code });
    const checkoutRes = await agent
      .post("/api/v1/orders/checkout")
      .send({ contactEmail: "buyer@test.woobe.internal", confirmEmail: "buyer@test.woobe.internal", address: checkoutAddress, paymentMethod: "COD" });
    expect(checkoutRes.status).toBe(201);
    createdOrderIds.push(checkoutRes.body.id);

    const deleteRes = await request(app).delete(`/api/v1/admin/coupons/${couponId}`).set(auth);
    expect(deleteRes.status).toBe(409);

    // Still there, untouched — deactivate remains available as the real action.
    const stillThereRes = await request(app).get(`/api/v1/admin/coupons/${couponId}`).set(auth);
    expect(stillThereRes.status).toBe(200);
    expect(stillThereRes.body.coupon.redemptionCount).toBe(1);
  });
});
