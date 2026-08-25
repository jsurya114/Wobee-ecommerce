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
  await prisma.$disconnect();
});

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

  it("blocks checkout below the ADR-021 minimum order weight", async () => {
    const { variantId } = await createTestVariant({ weightGrams: 200, quantityAvailable: 5 });

    const agent = request.agent(app);
    await agent.post("/api/v1/cart/items").send({ variantId, quantity: 1 });

    const res = await agent
      .post("/api/v1/orders/checkout")
      .send({ contactEmail: "buyer@test.woobe.internal", address: checkoutAddress, paymentMethod: "COD" });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("UNPROCESSABLE_ENTITY");
  });

  it("rejects checkout on an empty cart", async () => {
    const agent = request.agent(app);
    // Force cart creation without adding anything: hit GET /cart once to establish a guest cart cookie.
    await agent.get("/api/v1/cart");

    const res = await agent
      .post("/api/v1/orders/checkout")
      .send({ contactEmail: "buyer@test.woobe.internal", address: checkoutAddress, paymentMethod: "COD" });

    expect(res.status).toBe(422);
  });
});

describe("checkout: concurrent reservation (ADR-015)", () => {
  it("only one of two near-simultaneous checkouts succeeds on a stock=1 item", async () => {
    const { variantId } = await createTestVariant({ weightGrams: 1200, quantityAvailable: 1 });

    const agentA = request.agent(app);
    const agentB = request.agent(app);
    await agentA.post("/api/v1/cart/items").send({ variantId, quantity: 1 });
    await agentB.post("/api/v1/cart/items").send({ variantId, quantity: 1 });

    const body = { contactEmail: "buyer@test.woobe.internal", address: checkoutAddress, paymentMethod: "COD" as const };
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
