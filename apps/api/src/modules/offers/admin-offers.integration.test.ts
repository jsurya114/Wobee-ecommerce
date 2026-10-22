import { randomUUID } from "node:crypto";
import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

/**
 * Integration tests against the REAL test database — same helpers as
 * admin-products.integration.test.ts (loginAdmin/registerCustomer). Covers
 * Phase 2's admin offer management: RBAC, create/update/activate for every
 * scope, and the cross-field validation `validateOfferInput` enforces.
 */

const TEST_PREFIX = "admin-offers-integration";
const app = createApp();

let categoryId: string;
let otherCategoryId: string;
let productId: string;
/** Fix: admin offer discount validation — a product with a REAL, priced, active variant (`productId` above has none, so its `minPricePaiseCache` stays 0 and is excluded from the price-floor check entirely — see ValidateOfferDiscountUseCase's own doc comment). Its own dedicated category (`pricedCategoryId`) so it never perturbs the CATEGORY-scope tests above, which already assert a ₹300 FIXED_AMOUNT offer succeeds against `categoryId`. */
let pricedProductId: string;
let pricedCategoryId: string;
const PRICED_PRODUCT_PRICE_PAISE = 200_00;
const createdOfferIds: string[] = [];
const createdCategoryIds: string[] = [];
const createdProductIds: string[] = [];

beforeAll(async () => {
  const category = await prisma.category.create({ data: { name: `${TEST_PREFIX} Category`, slug: `${TEST_PREFIX}-cat` } });
  const otherCategory = await prisma.category.create({ data: { name: `${TEST_PREFIX} Other Category`, slug: `${TEST_PREFIX}-other-cat` } });
  const pricedCategory = await prisma.category.create({ data: { name: `${TEST_PREFIX} Priced Category`, slug: `${TEST_PREFIX}-priced-cat` } });
  categoryId = category.id;
  otherCategoryId = otherCategory.id;
  pricedCategoryId = pricedCategory.id;
  createdCategoryIds.push(category.id, otherCategory.id, pricedCategory.id);

  const product = await prisma.product.create({
    data: { name: `${TEST_PREFIX} Product`, slug: `${TEST_PREFIX}-product`, categoryId, pricingMode: "WEIGHT_BASED", isActive: true },
  });
  productId = product.id;
  createdProductIds.push(product.id);

  const pricedProduct = await prisma.product.create({
    data: {
      name: `${TEST_PREFIX} Priced Product`,
      slug: `${TEST_PREFIX}-priced-product`,
      categoryId: pricedCategoryId,
      pricingMode: "WEIGHT_BASED",
      isActive: true,
      minPricePaiseCache: PRICED_PRODUCT_PRICE_PAISE,
    },
  });
  pricedProductId = pricedProduct.id;
  createdProductIds.push(pricedProduct.id);
  await prisma.productVariant.create({
    data: {
      productId: pricedProductId,
      sku: `${TEST_PREFIX}-PRICED-SKU`,
      color: "Black",
      size: "One Size",
      weightGrams: 300,
      isActive: true,
      effectivePricePaiseCache: PRICED_PRODUCT_PRICE_PAISE,
    },
  });
});

afterAll(async () => {
  if (createdOfferIds.length > 0) {
    await prisma.offerProduct.deleteMany({ where: { offerId: { in: createdOfferIds } } });
    await prisma.offer.deleteMany({ where: { id: { in: createdOfferIds } } });
  }
  if (createdProductIds.length > 0) {
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
  }
  if (createdCategoryIds.length > 0) {
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  }
  await prisma.$disconnect();
});

async function loginAdmin(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/v1/admin/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

async function registerCustomer(): Promise<string> {
  const email = `${TEST_PREFIX}-${randomUUID()}@test.woobe.internal`;
  const res = await request(app).post("/api/v1/auth/register").send({ name: "Customer", email, password: "Passw0rd" });
  expect(res.status).toBe(201);
  await prisma.user.delete({ where: { id: res.body.user.id } }).catch(() => undefined);
  return res.body.accessToken as string;
}

const FUTURE_START = new Date(Date.now() - 60_000).toISOString();
const FUTURE_END = new Date(Date.now() + 60 * 60_000).toISOString();

describe("admin offers: RBAC", () => {
  it("403s a customer on /admin/offers", async () => {
    const token = await registerCustomer();
    const res = await request(app).get("/api/v1/admin/offers").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("403s an orders staff member (no MANAGE_CATALOG) on /admin/offers", async () => {
    const token = await loginAdmin("orders@woobe.in", "Staff@12345");
    const res = await request(app).get("/api/v1/admin/offers").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("allows a product_management_staff (MANAGE_CATALOG) to list offers", async () => {
    const token = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const res = await request(app).get("/api/v1/admin/offers").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe("admin offers: CRUD per scope", () => {
  it("creates an ALL_PRODUCTS offer with no target", async () => {
    const token = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${token}` };
    const res = await request(app)
      .post("/api/v1/admin/offers")
      .set(auth)
      .send({
        name: `${TEST_PREFIX} storewide`,
        discountType: "PERCENTAGE",
        discountValue: 15,
        scope: "ALL_PRODUCTS",
        startsAt: FUTURE_START,
        endsAt: FUTURE_END,
      });
    expect(res.status).toBe(201);
    createdOfferIds.push(res.body.offer.id);
    expect(res.body.offer.scope).toBe("ALL_PRODUCTS");
    expect(res.body.offer.categoryId).toBeNull();
    expect(res.body.offer.productIds).toEqual([]);
    expect(res.body.offer.isActive).toBe(true);
  });

  it("creates a CATEGORY offer with a categoryId", async () => {
    const token = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${token}` };
    const res = await request(app)
      .post("/api/v1/admin/offers")
      .set(auth)
      .send({
        name: `${TEST_PREFIX} category`,
        discountType: "FIXED_AMOUNT",
        discountValue: 300_00,
        scope: "CATEGORY",
        categoryId,
        startsAt: FUTURE_START,
        endsAt: FUTURE_END,
      });
    expect(res.status).toBe(201);
    createdOfferIds.push(res.body.offer.id);
    expect(res.body.offer.categoryId).toBe(categoryId);
  });

  it("creates a PRODUCTS offer with an explicit product list, and reads it back on GET one", async () => {
    const token = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${token}` };
    const res = await request(app)
      .post("/api/v1/admin/offers")
      .set(auth)
      .send({
        name: `${TEST_PREFIX} products`,
        discountType: "PERCENTAGE",
        discountValue: 25,
        scope: "PRODUCTS",
        productIds: [productId],
        startsAt: FUTURE_START,
        endsAt: FUTURE_END,
      });
    expect(res.status).toBe(201);
    createdOfferIds.push(res.body.offer.id);
    expect(res.body.offer.productIds).toEqual([productId]);

    const getRes = await request(app).get(`/api/v1/admin/offers/${res.body.offer.id}`).set(auth);
    expect(getRes.status).toBe(200);
    expect(getRes.body.offer.productIds).toEqual([productId]);
  });

  it("updates an offer's scope from CATEGORY to a different CATEGORY", async () => {
    const token = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${token}` };
    const created = await request(app)
      .post("/api/v1/admin/offers")
      .set(auth)
      .send({
        name: `${TEST_PREFIX} switchable`,
        discountType: "PERCENTAGE",
        discountValue: 10,
        scope: "CATEGORY",
        categoryId,
        startsAt: FUTURE_START,
        endsAt: FUTURE_END,
      });
    createdOfferIds.push(created.body.offer.id);

    const updated = await request(app)
      .patch(`/api/v1/admin/offers/${created.body.offer.id}`)
      .set(auth)
      .send({ categoryId: otherCategoryId });
    expect(updated.status).toBe(200);
    expect(updated.body.offer.categoryId).toBe(otherCategoryId);
  });

  it("activates and deactivates an offer independent of its schedule", async () => {
    const token = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${token}` };
    const created = await request(app)
      .post("/api/v1/admin/offers")
      .set(auth)
      .send({
        name: `${TEST_PREFIX} toggle`,
        discountType: "PERCENTAGE",
        discountValue: 10,
        scope: "ALL_PRODUCTS",
        startsAt: FUTURE_START,
        endsAt: FUTURE_END,
      });
    createdOfferIds.push(created.body.offer.id);

    const deactivated = await request(app).post(`/api/v1/admin/offers/${created.body.offer.id}/active`).set(auth).send({ isActive: false });
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.offer.isActive).toBe(false);

    const reactivated = await request(app).post(`/api/v1/admin/offers/${created.body.offer.id}/active`).set(auth).send({ isActive: true });
    expect(reactivated.body.offer.isActive).toBe(true);
  });
});

describe("admin offers: validation", () => {
  const token = () => loginAdmin("catalog@woobe.in", "Staff@12345");

  it("rejects a percentage discount over 100", async () => {
    const auth = { Authorization: `Bearer ${await token()}` };
    const res = await request(app)
      .post("/api/v1/admin/offers")
      .set(auth)
      .send({ name: "bad", discountType: "PERCENTAGE", discountValue: 150, scope: "ALL_PRODUCTS", startsAt: FUTURE_START, endsAt: FUTURE_END });
    expect(res.status).toBe(400);
  });

  it("rejects endsAt at or before startsAt", async () => {
    const auth = { Authorization: `Bearer ${await token()}` };
    const res = await request(app)
      .post("/api/v1/admin/offers")
      .set(auth)
      .send({ name: "bad", discountType: "PERCENTAGE", discountValue: 10, scope: "ALL_PRODUCTS", startsAt: FUTURE_END, endsAt: FUTURE_START });
    expect(res.status).toBe(400);
  });

  it("rejects CATEGORY scope with no categoryId", async () => {
    const auth = { Authorization: `Bearer ${await token()}` };
    const res = await request(app)
      .post("/api/v1/admin/offers")
      .set(auth)
      .send({ name: "bad", discountType: "PERCENTAGE", discountValue: 10, scope: "CATEGORY", startsAt: FUTURE_START, endsAt: FUTURE_END });
    expect(res.status).toBe(400);
  });

  it("rejects PRODUCTS scope with an empty product list", async () => {
    const auth = { Authorization: `Bearer ${await token()}` };
    const res = await request(app)
      .post("/api/v1/admin/offers")
      .set(auth)
      .send({ name: "bad", discountType: "PERCENTAGE", discountValue: 10, scope: "PRODUCTS", startsAt: FUTURE_START, endsAt: FUTURE_END });
    expect(res.status).toBe(400);
  });

  it("rejects a categoryId set on an ALL_PRODUCTS-scope offer", async () => {
    const auth = { Authorization: `Bearer ${await token()}` };
    const res = await request(app)
      .post("/api/v1/admin/offers")
      .set(auth)
      .send({
        name: "bad",
        discountType: "PERCENTAGE",
        discountValue: 10,
        scope: "ALL_PRODUCTS",
        categoryId,
        startsAt: FUTURE_START,
        endsAt: FUTURE_END,
      });
    expect(res.status).toBe(400);
  });
});

/**
 * Fix: admin offer discount validation — a FIXED_AMOUNT offer must never
 * be saveable with a discount larger than the price of any product it
 * targets. Deliberately never exercises ALL_PRODUCTS scope here: that
 * validates against the store's live global minimum price, which is
 * shared, unpredictable state across every other test file's own
 * fixtures in this DB — same reasoning products-on-offer.integration.test.ts's
 * own doc comment already gives for never creating an ALL_PRODUCTS-scope
 * offer in an integration test. ALL_PRODUCTS is covered instead at the
 * unit level (validate-offer-discount.use-case.test.ts).
 */
describe("admin offers: discount vs. product price validation", () => {
  const token = () => loginAdmin("catalog@woobe.in", "Staff@12345");

  it("rejects a FIXED_AMOUNT discount larger than the only targeted product's price", async () => {
    const auth = { Authorization: `Bearer ${await token()}` };
    const res = await request(app)
      .post("/api/v1/admin/offers")
      .set(auth)
      .send({
        name: `${TEST_PREFIX} too-big-fixed-discount`,
        discountType: "FIXED_AMOUNT",
        discountValue: PRICED_PRODUCT_PRICE_PAISE + 100,
        scope: "PRODUCTS",
        productIds: [pricedProductId],
        startsAt: FUTURE_START,
        endsAt: FUTURE_END,
      });
    expect(res.status).toBe(400);
    expect(res.body.error.fieldErrors?.discountValue?.[0]).toMatch(/cannot exceed/i);
  });

  it("rejects the same discount when the product is targeted via its CATEGORY instead", async () => {
    const auth = { Authorization: `Bearer ${await token()}` };
    const res = await request(app)
      .post("/api/v1/admin/offers")
      .set(auth)
      .send({
        name: `${TEST_PREFIX} too-big-fixed-discount-category`,
        discountType: "FIXED_AMOUNT",
        discountValue: PRICED_PRODUCT_PRICE_PAISE + 100,
        scope: "CATEGORY",
        categoryId: pricedCategoryId,
        startsAt: FUTURE_START,
        endsAt: FUTURE_END,
      });
    expect(res.status).toBe(400);
    expect(res.body.error.fieldErrors?.discountValue?.[0]).toMatch(/cannot exceed/i);
  });

  it("allows a FIXED_AMOUNT discount exactly equal to the product's price — final price ₹0", async () => {
    const auth = { Authorization: `Bearer ${await token()}` };
    const res = await request(app)
      .post("/api/v1/admin/offers")
      .set(auth)
      .send({
        name: `${TEST_PREFIX} exact-fixed-discount`,
        discountType: "FIXED_AMOUNT",
        discountValue: PRICED_PRODUCT_PRICE_PAISE,
        scope: "PRODUCTS",
        productIds: [pricedProductId],
        startsAt: FUTURE_START,
        endsAt: FUTURE_END,
      });
    expect(res.status).toBe(201);
    createdOfferIds.push(res.body.offer.id);
  });

  it("allows a FIXED_AMOUNT discount less than the product's price", async () => {
    const auth = { Authorization: `Bearer ${await token()}` };
    const res = await request(app)
      .post("/api/v1/admin/offers")
      .set(auth)
      .send({
        name: `${TEST_PREFIX} smaller-fixed-discount`,
        discountType: "FIXED_AMOUNT",
        discountValue: PRICED_PRODUCT_PRICE_PAISE - 100,
        scope: "PRODUCTS",
        productIds: [pricedProductId],
        startsAt: FUTURE_START,
        endsAt: FUTURE_END,
      });
    expect(res.status).toBe(201);
    createdOfferIds.push(res.body.offer.id);
  });

  it("still allows a 100% PERCENTAGE offer on the same product — the ₹200/₹250 rule is FIXED_AMOUNT-only", async () => {
    const auth = { Authorization: `Bearer ${await token()}` };
    const res = await request(app)
      .post("/api/v1/admin/offers")
      .set(auth)
      .send({
        name: `${TEST_PREFIX} full-percentage-discount`,
        discountType: "PERCENTAGE",
        discountValue: 100,
        scope: "PRODUCTS",
        productIds: [pricedProductId],
        startsAt: FUTURE_START,
        endsAt: FUTURE_END,
      });
    expect(res.status).toBe(201);
    createdOfferIds.push(res.body.offer.id);
  });

  it("re-validates on UPDATE against the merged shape, even when only discountValue is resent", async () => {
    const auth = { Authorization: `Bearer ${await token()}` };
    const created = await request(app)
      .post("/api/v1/admin/offers")
      .set(auth)
      .send({
        name: `${TEST_PREFIX} update-target`,
        discountType: "FIXED_AMOUNT",
        discountValue: 50_00,
        scope: "PRODUCTS",
        productIds: [pricedProductId],
        startsAt: FUTURE_START,
        endsAt: FUTURE_END,
      });
    expect(created.status).toBe(201);
    createdOfferIds.push(created.body.offer.id);

    const updated = await request(app)
      .patch(`/api/v1/admin/offers/${created.body.offer.id}`)
      .set(auth)
      .send({ discountValue: PRICED_PRODUCT_PRICE_PAISE + 100 });
    expect(updated.status).toBe(400);
    expect(updated.body.error.fieldErrors?.discountValue?.[0]).toMatch(/cannot exceed/i);

    // The offer itself must be untouched by the rejected update.
    const unchanged = await request(app).get(`/api/v1/admin/offers/${created.body.offer.id}`).set(auth);
    expect(unchanged.body.offer.discountValue).toBe(50_00);
  });
});
