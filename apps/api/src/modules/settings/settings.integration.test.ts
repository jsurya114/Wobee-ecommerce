// apps/api/src/modules/settings/settings.integration.test.ts
import { randomUUID } from "node:crypto";
import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

/**
 * Admin settings (2026-09-28) against the REAL test database: the AppConfig
 * singleton, the versioned ShippingRule edit, the public config endpoint, and
 * the two checkout rules they drive (minimum item count, free delivery by
 * items subtotal). Every global row this file touches is restored in afterAll
 * — the AppConfig row to exactly what it was, and every ShippingRule row it
 * inserted deleted — because other suites read the same shared settings.
 */

const TEST_PREFIX = "settings-integration";
const app = createApp();
const testStartedAt = new Date();

let categoryId: string;
let warehouseId: string;
let previousAppConfig: Awaited<ReturnType<typeof prisma.appConfig.findUnique>>;
const createdProductIds: string[] = [];
const createdVariantIds: string[] = [];
const createdOrderIds: string[] = [];

beforeAll(async () => {
  categoryId = (await prisma.category.findFirstOrThrow({ where: { isActive: true } })).id;
  warehouseId = (await prisma.warehouse.findFirstOrThrow({ where: { isActive: true } })).id;
  previousAppConfig = await prisma.appConfig.findUnique({
    where: { id: "singleton" },
  });
});

afterAll(async () => {
  if (previousAppConfig) {
    const { id: _id, updatedAt: _updatedAt, ...values } = previousAppConfig;
    await prisma.appConfig.update({ where: { id: "singleton" }, data: values });
  } else {
    await prisma.appConfig.deleteMany({ where: { id: "singleton" } });
  }
  await prisma.shippingRule.deleteMany({
    where: { effectiveFrom: { gte: testStartedAt } },
  });
  if (createdOrderIds.length > 0) {
    await prisma.payment.deleteMany({
      where: { orderId: { in: createdOrderIds } },
    });
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  }
  if (createdVariantIds.length > 0) {
    await prisma.cartItem.deleteMany({
      where: { variantId: { in: createdVariantIds } },
    });
    await prisma.productVariant.deleteMany({
      where: { id: { in: createdVariantIds } },
    });
  }
  if (createdProductIds.length > 0) {
    await prisma.product.deleteMany({
      where: { id: { in: createdProductIds } },
    });
  }
  await prisma.$disconnect();
});

async function loginAdmin(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/v1/admin/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

async function createTestVariant(weightGrams: number, quantityAvailable = 10): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const product = await prisma.product.create({
    data: {
      name: `${TEST_PREFIX} Product ${suffix}`,
      slug: `${TEST_PREFIX}-${suffix}`,
      categoryId,
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
      weightGrams,
      isActive: true,
    },
  });
  createdVariantIds.push(variant.id);
  await prisma.inventory.create({
    data: {
      variantId: variant.id,
      warehouseId,
      quantityAvailable,
      quantityReserved: 0,
    },
  });
  return variant.id;
}

const checkoutBody = {
  contactEmail: "buyer@test.woobe.internal",
  confirmEmail: "buyer@test.woobe.internal",
  address: {
    fullName: "Test Buyer",
    phone: "9876543210",
    line1: "123 Test Street",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560001",
  },
  paymentMethod: "COD",
};

describe("admin settings: RBAC", () => {
  it("401s anonymous callers on both config and shipping", async () => {
    expect((await request(app).get("/api/v1/admin/settings/config")).status).toBe(401);
    expect((await request(app).patch("/api/v1/admin/settings/shipping").send({ standardFeePaise: 1 })).status).toBe(401);
  });

  it("403s staff without MANAGE_SETTINGS", async () => {
    const token = await loginAdmin("catalog@woobe.in", "Staff@12345");
    expect((await request(app).get("/api/v1/admin/settings/config").set("Authorization", `Bearer ${token}`)).status).toBe(403);
    expect(
      (await request(app).patch("/api/v1/admin/settings/config").set("Authorization", `Bearer ${token}`).send({ returnsEnabled: true }))
        .status,
    ).toBe(403);
  });
});

describe("admin settings: store config", () => {
  it("rejects invalid presets and quantities with field errors", async () => {
    const token = await loginAdmin("admin@woobe.in", "Admin@12345");
    const patch = (body: object) => request(app).patch("/api/v1/admin/settings/config").set("Authorization", `Bearer ${token}`).send(body);

    const comma = await patch({ presetSizes: ["S", "M,L"] });
    expect(comma.status).toBe(400);
    expect(comma.body.error.fieldErrors.presetSizes).toBeDefined();

    expect((await patch({ presetFits: ["Slim", "slim"] })).status).toBe(400);
    expect((await patch({ presetFabrics: [] })).status).toBe(400);
    expect((await patch({ minCartQuantity: 0 })).status).toBe(400);
    expect((await patch({})).status).toBe(400);
  });

  it("saves a partial update and the public endpoint reflects it immediately", async () => {
    const token = await loginAdmin("admin@woobe.in", "Admin@12345");
    const res = await request(app)
      .patch("/api/v1/admin/settings/config")
      .set("Authorization", `Bearer ${token}`)
      .send({ presetSizes: [" S ", "M", "Free Size"], returnsEnabled: true });
    expect(res.status).toBe(200);
    expect(res.body.config.presetSizes).toEqual(["S", "M", "Free Size"]);
    expect(res.body.config.returnsEnabled).toBe(true);

    const pub = await request(app).get("/api/v1/settings/config/public");
    expect(pub.status).toBe(200);
    expect(pub.body.config.presetSizes).toEqual(["S", "M", "Free Size"]);
    expect(pub.body.config.returnsEnabled).toBe(true);
    // Only the public subset — nothing internal leaks.
    expect(Object.keys(pub.body.config).sort()).toEqual(
      [
        "codShippingUpfront",
        "freeDeliveryMinSubtotalPaise",
        "minCartQuantity",
        "minCartWeightGrams",
        "presetFabrics",
        "presetFits",
        "presetSizes",
        "ratePerKgPaise",
        "returnsEnabled",
      ].sort(),
    );
  });

  it("echoes the current global ₹/kg rate so the admin variant form can preview weight-based prices", async () => {
    const rate = await prisma.pricingSetting.findFirstOrThrow({ orderBy: { effectiveFrom: "desc" } });
    const pub = await request(app).get("/api/v1/settings/config/public");
    expect(pub.status).toBe(200);
    expect(pub.body.config.ratePerKgPaise).toBe(rate.defaultRatePerKgPaise);
    expect(Number.isInteger(pub.body.config.ratePerKgPaise)).toBe(true);
  });
});

describe("admin settings: shipping rule", () => {
  it("saves a patch as a NEW versioned rule, merged onto the current one", async () => {
    const token = await loginAdmin("admin@woobe.in", "Admin@12345");
    const before = await request(app).get("/api/v1/admin/settings/shipping").set("Authorization", `Bearer ${token}`);
    expect(before.status).toBe(200);
    const rowsBefore = await prisma.shippingRule.count();

    const res = await request(app)
      .patch("/api/v1/admin/settings/shipping")
      .set("Authorization", `Bearer ${token}`)
      .send({ standardFeePaise: before.body.rule.standardFeePaise + 1 });
    expect(res.status).toBe(200);
    expect(res.body.rule.standardFeePaise).toBe(before.body.rule.standardFeePaise + 1);
    expect(res.body.rule.minWeightGramsForCheckout).toBe(before.body.rule.minWeightGramsForCheckout);
    expect(await prisma.shippingRule.count()).toBe(rowsBefore + 1);

    const pub = await request(app).get("/api/v1/settings/config/public");
    expect(pub.body.config.minCartWeightGrams).toBe(before.body.rule.minWeightGramsForCheckout);
  });

  it("rejects negative / non-integer values", async () => {
    const token = await loginAdmin("admin@woobe.in", "Admin@12345");
    const patch = (body: object) =>
      request(app).patch("/api/v1/admin/settings/shipping").set("Authorization", `Bearer ${token}`).send(body);
    expect((await patch({ standardFeePaise: -1 })).status).toBe(400);
    expect((await patch({ freeDeliveryMinSubtotalPaise: 10.5 })).status).toBe(400);
  });
});

describe("checkout: store-wide rules", () => {
  it("blocks checkout below the minimum item count, then allows it once met", async () => {
    await prisma.appConfig.upsert({
      where: { id: "singleton" },
      create: { minCartQuantity: 3 },
      update: { minCartQuantity: 3 },
    });
    try {
      const variantId = await createTestVariant(1200);
      const agent = request.agent(app);
      await agent.post("/api/v1/cart/items").send({ variantId, quantity: 1 });

      const blocked = await agent.post("/api/v1/orders/checkout").send(checkoutBody);
      expect(blocked.status).toBe(422);
      expect(blocked.body.error.message).toContain("add 2 more items");

      const cart = await agent.get("/api/v1/cart");
      await agent.patch(`/api/v1/cart/items/${cart.body.items[0].itemId}`).send({ quantity: 3 });
      const placed = await agent.post("/api/v1/orders/checkout").send(checkoutBody);
      expect(placed.status, JSON.stringify(placed.body)).toBe(201);
      createdOrderIds.push(placed.body.id);
    } finally {
      await prisma.appConfig.update({
        where: { id: "singleton" },
        data: { minCartQuantity: 1 },
      });
    }
  });

  it("grants free delivery by items subtotal on the cart AND at checkout (either rule qualifies)", async () => {
    const current = await prisma.shippingRule.findFirstOrThrow({
      where: { effectiveFrom: { lte: new Date() } },
      orderBy: { effectiveFrom: "desc" },
    });
    // 1200g sits between the 1kg minimum and the 1.5kg weight threshold, so by weight alone it pays the fee.
    expect(1200).toBeLessThan(current.freeDeliveryThresholdGrams);
    const variantId = await createTestVariant(1200);

    const payingAgent = request.agent(app);
    await payingAgent.post("/api/v1/cart/items").send({ variantId, quantity: 1 });
    const paying = await payingAgent.get("/api/v1/cart");
    expect(paying.body.shipping.isFreeDelivery).toBe(false);
    expect(paying.body.shipping.shippingFeePaise).toBe(current.standardFeePaise);

    const { id: _id, createdAt: _c, effectiveFrom: _e, ...values } = current;
    await prisma.shippingRule.create({
      data: { ...values, freeDeliveryMinSubtotalPaise: 100 },
    }); // ₹1 — any real cart clears it

    const cart = await payingAgent.get("/api/v1/cart");
    expect(cart.body.shipping.isFreeDelivery).toBe(true);
    expect(cart.body.shipping.shippingFeePaise).toBe(0);

    const placed = await payingAgent.post("/api/v1/orders/checkout").send(checkoutBody);
    expect(placed.status, JSON.stringify(placed.body)).toBe(201);
    createdOrderIds.push(placed.body.id);
    expect(placed.body.shippingFeePaise).toBe(0);
    expect(placed.body.totalPaise).toBe(placed.body.subtotalPaise + placed.body.taxPaise - placed.body.discountPaise);
  });
});
