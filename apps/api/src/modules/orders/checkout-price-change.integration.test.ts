import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

/**
 * Week 3 Day 1 — plan's explicit "Price/rate changes after cart creation"
 * test case (E2E scenario #6). `PricingSetting` is a single, GLOBAL,
 * append-only table (see pricing.repository.ts's own comment) that every
 * OTHER integration test in the suite also reads live — mutating it is
 * genuinely risky to do inside a shared test file (vitest runs `it()`
 * blocks within one file concurrently even with fileParallelism off, see
 * vitest.config.ts's own comment), so this lives in its own file and
 * contains exactly one test, insulated from any sibling test's concurrent
 * pricing read. The inserted row is deleted in `afterAll`, restoring
 * exactly the prior global rate for every test file that runs after this
 * one (vitest runs files sequentially).
 */

const TEST_PREFIX = "day1-price-change";
const app = createApp();

let categoryId: string;
let warehouseId: string;
const createdProductIds: string[] = [];
const createdVariantIds: string[] = [];
const createdOrderIds: string[] = [];
const insertedPricingSettingIds: string[] = [];

beforeAll(async () => {
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  categoryId = category.id;
  const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { isActive: true } });
  warehouseId = warehouse.id;
});

afterAll(async () => {
  if (insertedPricingSettingIds.length > 0) {
    await prisma.pricingSetting.deleteMany({ where: { id: { in: insertedPricingSettingIds } } });
  }
  if (createdOrderIds.length > 0) {
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

describe("checkout: authoritative price re-read (Week 3 Day 1, E2E #6)", () => {
  it("charges the NEW global rate/kg when it changes after the item was added to cart — never the rate at add-to-cart time", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const product = await prisma.product.create({
      data: { name: `${TEST_PREFIX} Product ${suffix}`, slug: `${TEST_PREFIX}-${suffix}`, categoryId, isActive: true },
    });
    createdProductIds.push(product.id);
    const variant = await prisma.productVariant.create({
      data: { productId: product.id, sku: `${TEST_PREFIX}-${suffix}`, color: "Black", size: "M", weightGrams: 1200, isActive: true },
    });
    createdVariantIds.push(variant.id);
    await prisma.inventory.create({ data: { variantId: variant.id, warehouseId, quantityAvailable: 5, quantityReserved: 0 } });

    const rateAtAddToCart = (await prisma.pricingSetting.findFirstOrThrow({ orderBy: { effectiveFrom: "desc" } })).defaultRatePerKgPaise;

    const agent = request.agent(app);
    const addRes = await agent.post("/api/v1/cart/items").send({ variantId: variant.id, quantity: 1 });
    expect(addRes.status).toBe(200);
    // Cart's own read already reflects the current rate — assert the
    // precondition explicitly so a later assertion failure can't be
    // confused with "the fixture itself already used the new rate".
    expect(addRes.body.items[0].unitPricePaise).toBe(Math.round((1200 * rateAtAddToCart) / 1000));

    // Simulate an admin changing the global rate/kg WHILE this cart sits
    // idle — a distinctly different rate (2x) so a stale read is unmissable.
    const newRate = rateAtAddToCart * 2;
    const inserted = await prisma.pricingSetting.create({ data: { defaultRatePerKgPaise: newRate, effectiveFrom: new Date() } });
    insertedPricingSettingIds.push(inserted.id);

    try {
      const checkoutRes = await agent.post("/api/v1/orders/checkout").send({
        contactEmail: "price-change@test.woobe.internal",
        confirmEmail: "price-change@test.woobe.internal",
        address: { fullName: "Price Change Tester", phone: "9876543210", line1: "1 Test St", city: "Bengaluru", state: "Karnataka", pincode: "560001" },
        paymentMethod: "COD",
      });
      expect(checkoutRes.status).toBe(201);
      createdOrderIds.push(checkoutRes.body.id);

      const expectedUnitPricePaise = Math.round((1200 * newRate) / 1000);
      expect(checkoutRes.body.items[0].unitPricePaise).toBe(expectedUnitPricePaise);
      expect(checkoutRes.body.subtotalPaise).toBe(expectedUnitPricePaise);
      // The persisted row, not just the HTTP response — proves the NEW rate
      // was actually snapshotted onto OrderItem, not just echoed in transit.
      const persistedItem = await prisma.orderItem.findFirstOrThrow({ where: { orderId: checkoutRes.body.id } });
      expect(persistedItem.unitPricePaise).toBe(expectedUnitPricePaise);
      expect(persistedItem.unitPricePaise).not.toBe(Math.round((1200 * rateAtAddToCart) / 1000)); // never the stale rate
    } finally {
      // Belt-and-suspenders — afterAll also does this — but restoring
      // immediately (not at the end of the whole file) is what actually
      // protects a sibling test in a DIFFERENT file that runs right after
      // this one, since vitest runs files sequentially.
      await prisma.pricingSetting.delete({ where: { id: inserted.id } }).catch(() => {});
    }
  });
});
