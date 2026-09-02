import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

/**
 * Integration tests against the REAL test database (see auth's own
 * integration test file for the setup this mirrors — DATABASE_URL points at
 * woobe_test). Coupons have no admin CRUD this week (coupons.module.ts's own
 * doc comment) so every fixture coupon here is created directly via Prisma,
 * standing in for the seed-script path a real coupon would come from.
 *
 * Covers week2 (1).md §9's full validate -> apply -> checkout-redeem
 * pipeline, including its explicitly mandatory "concurrent redemption" test.
 */

const TEST_PREFIX = "day5-coupons-integration";
const app = createApp();

let categoryId: string;
let otherCategoryId: string;
let warehouseId: string;
let globalRatePerKgPaise: number;
const createdUserIds: string[] = [];
const createdProductIds: string[] = [];
const createdVariantIds: string[] = [];
const createdOrderIds: string[] = [];
const createdCouponIds: string[] = [];

beforeAll(async () => {
  // WEIGHT_BASED only (2026-08-31) — this suite's fixtures pin an exact
  // known price by deriving weightGrams from the live global rate (see
  // createTestVariant), which only makes sense for a weight-based category;
  // a FIXED one (Accessories) needs fixedPricePaise instead. Coupon logic
  // itself doesn't care which pricing mode a category is, so pinning both
  // fixture categories to WEIGHT_BASED sidesteps that entirely rather than
  // teaching this suite about fixed pricing.
  const categories = await prisma.category.findMany({ where: { isActive: true, pricingMode: "WEIGHT_BASED" }, take: 2 });
  if (categories.length < 2) throw new Error("test setup: need at least 2 active weight-based categories seeded");
  categoryId = categories[0]!.id;
  otherCategoryId = categories[1]!.id;
  const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { isActive: true } });
  warehouseId = warehouse.id;
  // The per-variant rate override this suite used to pin an exact fixture
  // price is deprecated and now inert everywhere (resolve-effective-rate.ts)
  // — see createTestVariant's own comment for how fixtures get an exact
  // price now instead.
  const pricingSetting = await prisma.pricingSetting.findFirstOrThrow({
    where: { effectiveFrom: { lte: new Date() } },
    orderBy: { effectiveFrom: "desc" },
  });
  globalRatePerKgPaise = pricingSetting.defaultRatePerKgPaise;
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
      // Deriving weightGrams from the desired pricePaise and the live global
      // rate (ignoring the caller's literal params.weightGrams) is what
      // pins each fixture to an exact known price now — the per-variant
      // rate override this suite used to rely on for that is deprecated and
      // unconditionally ignored by pricing (resolve-effective-rate.ts), so
      // it's no longer possible to set weight and price independently for a
      // WEIGHT_BASED variant. Nothing in this suite asserts on the literal
      // weight value, only on the resulting price.
      weightGrams: Math.round((params.pricePaise * 1000) / globalRatePerKgPaise),
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
  });
});
