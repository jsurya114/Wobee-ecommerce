import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

/**
 * Phase 1 (2026-09-14) — Product.pricingMode's own "historical order
 * remains unchanged" requirement (spec item S), the same guarantee
 * checkout-price-change.integration.test.ts already proves for the global
 * rate/kg. OrderItem snapshots `pricingMode`/`unitPricePaise` at checkout
 * (see that model's own doc comment in schema.prisma) — this proves that
 * snapshot really is immune to a LATER admin edit of the product itself:
 * changing pricingMode (FIXED -> WEIGHT_BASED) and the variant's own
 * fixedPricePaise after the order exists must not alter the already-placed
 * order's price, in either the DB row or the customer-facing order-detail
 * read.
 *
 * Own file for the same reason checkout-price-change.integration.test.ts
 * is isolated — mutating Product/ProductVariant pricing state is safest
 * insulated from any sibling test's concurrent read of the same rows.
 */

const TEST_PREFIX = "phase1-pricing-mode-change";
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
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } }); // cascades OrderItem
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

describe("orders: historical OrderItem is immune to a later Product.pricingMode change (Phase 1 spec item S)", () => {
  it("checks out a FIXED-price line, then flips the product to WEIGHT_BASED — the placed order's price/pricingMode never changes", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const product = await prisma.product.create({
      data: { name: `${TEST_PREFIX} Product ${suffix}`, slug: `${TEST_PREFIX}-${suffix}`, categoryId, pricingMode: "FIXED", isActive: true },
    });
    createdProductIds.push(product.id);
    const fixedPricePaise = 120_00;
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `${TEST_PREFIX}-${suffix}`,
        color: "Black",
        size: "One Size",
        weightGrams: 50, // deliberately tiny — proves price does NOT come from weight
        fixedPricePaise,
        isActive: true,
      },
    });
    createdVariantIds.push(variant.id);
    await prisma.inventory.create({ data: { variantId: variant.id, warehouseId, quantityAvailable: 5, quantityReserved: 0 } });

    const agent = request.agent(app);
    const addRes = await agent.post("/api/v1/cart/items").send({ variantId: variant.id, quantity: 1 });
    expect(addRes.status).toBe(200);
    expect(addRes.body.items[0].unitPricePaise).toBe(fixedPricePaise);

    const checkoutRes = await agent.post("/api/v1/orders/checkout").send({
      contactEmail: "pricing-mode-change@test.woobe.internal",
      confirmEmail: "pricing-mode-change@test.woobe.internal",
      address: { fullName: "Mode Change Tester", phone: "9876543210", line1: "1 Test St", city: "Bengaluru", state: "Karnataka", pincode: "560001" },
      paymentMethod: "COD",
    });
    expect(checkoutRes.status).toBe(201);
    createdOrderIds.push(checkoutRes.body.id);
    expect(checkoutRes.body.items[0].unitPricePaise).toBe(fixedPricePaise);
    expect(checkoutRes.body.items[0].pricingMode).toBe("FIXED");

    // Now edit the PRODUCT after the order already exists: flip to
    // WEIGHT_BASED and clear the variant's fixed price — exactly what
    // UpdateProductUseCase's own pricingMode-switch does.
    await prisma.$transaction([
      prisma.product.update({ where: { id: product.id }, data: { pricingMode: "WEIGHT_BASED" } }),
      prisma.productVariant.update({ where: { id: variant.id }, data: { fixedPricePaise: null } }),
    ]);

    const rate = await prisma.pricingSetting.findFirstOrThrow({ orderBy: { effectiveFrom: "desc" } });
    const newWeightBasedPrice = Math.round((50 * rate.defaultRatePerKgPaise) / 1000);
    // Sanity: the NEW live price for this variant really is different from
    // the historical fixed price — otherwise this test couldn't detect a
    // regression that recomputed the order from current product state.
    expect(newWeightBasedPrice).not.toBe(fixedPricePaise);

    // The persisted OrderItem — never recomputed from the current Product/ProductVariant row.
    const persistedItem = await prisma.orderItem.findFirstOrThrow({ where: { orderId: checkoutRes.body.id } });
    expect(persistedItem.unitPricePaise).toBe(fixedPricePaise);
    expect(persistedItem.pricingMode).toBe("FIXED");
    expect(persistedItem.lineTotalPaise).toBe(fixedPricePaise);

    // The customer-facing order-detail read agrees — not just the raw row.
    const orderDetailRes = await agent.get(`/api/v1/orders/${checkoutRes.body.id}`);
    expect(orderDetailRes.status).toBe(200);
    expect(orderDetailRes.body.items[0].unitPricePaise).toBe(fixedPricePaise);
    expect(orderDetailRes.body.totalPaise).toBe(checkoutRes.body.totalPaise);
  });
});
