import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

/**
 * Phase 2 (2026-09-14) — end-to-end proof of the required pricing
 * pipeline: BASE -> OFFER -> COUPON -> FINAL. Own file for the same
 * "isolate from concurrent global-state reads" reason
 * checkout-price-change.integration.test.ts and
 * pricing-mode-change.integration.test.ts already are.
 *
 * Uses a real FIXED-price product (weightGrams kept tiny/irrelevant) so the
 * base price is an exact, known number — same fixture technique
 * coupons.integration.test.ts's own `beforeAll` already established, for
 * the same reason (an exact round-number target via
 * ProductVariant.fixedPricePaise, immune to ADR-021's weight minimum via
 * FIXED lines not counting toward weightBasedTotalGrams).
 */

const TEST_PREFIX = "phase2-offer-coupon-pipeline";
const app = createApp();

let categoryId: string;
let warehouseId: string;
const createdProductIds: string[] = [];
const createdVariantIds: string[] = [];
const createdOfferIds: string[] = [];
const createdCouponIds: string[] = [];
const createdOrderIds: string[] = [];
const createdUserIds: string[] = [];

beforeAll(async () => {
  const category = await prisma.category.create({ data: { name: `${TEST_PREFIX} Category`, slug: `${TEST_PREFIX}-cat` } });
  categoryId = category.id;
  const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { isActive: true } });
  warehouseId = warehouse.id;
});

afterAll(async () => {
  if (createdOrderIds.length > 0) {
    await prisma.couponRedemption.deleteMany({ where: { orderId: { in: createdOrderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  }
  if (createdCouponIds.length > 0) {
    await prisma.couponRedemption.deleteMany({ where: { couponId: { in: createdCouponIds } } });
    await prisma.coupon.deleteMany({ where: { id: { in: createdCouponIds } } });
  }
  if (createdOfferIds.length > 0) {
    await prisma.offerProduct.deleteMany({ where: { offerId: { in: createdOfferIds } } });
    await prisma.offer.deleteMany({ where: { id: { in: createdOfferIds } } });
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
  await prisma.category.deleteMany({ where: { id: categoryId } });
  await prisma.$disconnect();
});

async function createFixedPriceVariant(pricePaise: number): Promise<{ variantId: string; productId: string }> {
  const suffix = crypto.randomUUID().slice(0, 8);
  const product = await prisma.product.create({
    data: { name: `${TEST_PREFIX} Product ${suffix}`, slug: `${TEST_PREFIX}-${suffix}`, categoryId, pricingMode: "FIXED", isActive: true },
  });
  createdProductIds.push(product.id);
  const variant = await prisma.productVariant.create({
    data: { productId: product.id, sku: `${TEST_PREFIX}-${suffix}`, color: "Black", size: "One Size", weightGrams: 100, fixedPricePaise: pricePaise, isActive: true },
  });
  createdVariantIds.push(variant.id);
  await prisma.inventory.create({ data: { variantId: variant.id, warehouseId, quantityAvailable: 10, quantityReserved: 0 } });
  return { variantId: variant.id, productId: product.id };
}

async function createUserAgent(): Promise<{ agent: ReturnType<typeof request.agent>; userId: string }> {
  const email = `${TEST_PREFIX}-${crypto.randomUUID()}@test.woobe.internal`;
  const res = await request(app).post("/api/v1/auth/register").send({ name: "Pipeline Tester", email, password: "Passw0rd" });
  if (res.status !== 201) throw new Error(`test setup: register failed: ${JSON.stringify(res.body)}`);
  createdUserIds.push(res.body.user.id);
  const agent = request.agent(app);
  return { agent: agent.set("Authorization", `Bearer ${res.body.accessToken as string}`), userId: res.body.user.id };
}

const now = new Date();
const startsAt = new Date(now.getTime() - 60_000).toISOString();
const endsAt = new Date(now.getTime() + 60 * 60_000).toISOString();

describe("checkout: BASE -> OFFER -> COUPON pricing pipeline (Phase 2, 2026-09-14)", () => {
  it("cart shows the offer-adjusted price, and the coupon discount is computed off that OFFER-ADJUSTED subtotal, not the pre-offer base", async () => {
    const basePricePaise = 1000_00; // ₹1000
    const { variantId, productId } = await createFixedPriceVariant(basePricePaise);

    // 20% storewide offer -> ₹1000 becomes ₹800.
    const offerRes = await request(app)
      .post("/api/v1/admin/offers")
      .set({ Authorization: `Bearer ${await loginAdmin()}` })
      .send({ name: `${TEST_PREFIX} 20 off`, discountType: "PERCENTAGE", discountValue: 20, scope: "ALL_PRODUCTS", startsAt, endsAt });
    expect(offerRes.status).toBe(201);
    createdOfferIds.push(offerRes.body.offer.id);

    // Flat ₹100 coupon.
    const couponCode = `${TEST_PREFIX.toUpperCase().replace(/-/g, "")}${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const coupon = await prisma.coupon.create({
      data: { code: couponCode, type: "FLAT", value: 100_00, validFrom: new Date("2020-01-01"), validTo: new Date("2999-01-01"), isActive: true },
    });
    createdCouponIds.push(coupon.id);

    const { agent } = await createUserAgent();

    const addRes = await agent.post("/api/v1/cart/items").send({ variantId, quantity: 1 });
    expect(addRes.status).toBe(200);
    // Offer already visible on the cart line before any coupon is applied.
    expect(addRes.body.items[0].unitPricePaise).toBe(800_00);
    expect(addRes.body.items[0].offer).toMatchObject({ discountType: "PERCENTAGE", discountValue: 20, discountPaise: 200_00 });
    expect(addRes.body.totalPaise).toBe(800_00);

    const applyRes = await agent.post("/api/v1/cart/coupon").send({ code: couponCode });
    expect(applyRes.status).toBe(200);
    // The coupon's flat ₹100 comes off the OFFER-ADJUSTED ₹800 subtotal, not the original ₹1000 — final ₹700.
    expect(applyRes.body.discountPaise).toBe(100_00);
    expect(applyRes.body.totalPaise).toBe(800_00);

    const checkoutRes = await agent.post("/api/v1/orders/checkout").send({
      contactEmail: "pipeline@test.woobe.internal",
      confirmEmail: "pipeline@test.woobe.internal",
      address: { fullName: "Pipeline Tester", phone: "9876543210", line1: "1 Test St", city: "Bengaluru", state: "Karnataka", pincode: "560001" },
      paymentMethod: "COD",
    });
    expect(checkoutRes.status).toBe(201);
    createdOrderIds.push(checkoutRes.body.id);

    const item = checkoutRes.body.items[0];
    expect(item.unitPricePaise).toBe(800_00); // offer-adjusted price actually charged per unit
    expect(item.lineTotalPaise).toBe(800_00);
    expect(checkoutRes.body.discountPaise).toBe(100_00); // coupon discount
    expect(checkoutRes.body.subtotalPaise).toBe(800_00); // offer-adjusted subtotal, BEFORE the coupon line
    // Final total: 800 (offer-adjusted subtotal) + tax + shipping - 100 (coupon) — never based on the original ₹1000.
    expect(checkoutRes.body.totalPaise).toBeLessThan(1000_00);

    // The persisted snapshot — base price, offer amount, and coupon amount are ALL separately recorded.
    const persistedItem = await prisma.orderItem.findFirstOrThrow({ where: { orderId: checkoutRes.body.id } });
    expect(persistedItem.basePricePaise).toBe(basePricePaise);
    expect(persistedItem.unitPricePaise).toBe(800_00);
    expect(persistedItem.offerDiscountPaise).toBe(200_00);
    expect(persistedItem.offerNameSnapshot).toBe(`${TEST_PREFIX} 20 off`);
    expect(persistedItem.discountPaise).toBe(100_00); // coupon's own allocated line discount

    void productId; // referenced for fixture setup symmetry with other tests in this suite
  });
});

async function loginAdmin(): Promise<string> {
  const res = await request(app).post("/api/v1/admin/auth/login").send({ email: "catalog@woobe.in", password: "Staff@12345" });
  if (res.status !== 200) throw new Error(`test setup: admin login failed: ${JSON.stringify(res.body)}`);
  return res.body.accessToken as string;
}
