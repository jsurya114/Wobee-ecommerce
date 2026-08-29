import { randomUUID } from "node:crypto";
import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

/**
 * Integration tests against the REAL test database — helpers mirror
 * admin.integration.test.ts's own (loginAdmin). Covers week2 (1).md §16's
 * admin product/variant/media management: create/edit/deactivate, the
 * price-cache recompute a weight/rate-override change triggers, the
 * inventory row a new variant always gets, media attach/reorder/remove,
 * and RBAC (MANAGE_CATALOG).
 */

const TEST_PREFIX = "admin-products-integration";
const app = createApp();

let categoryId: string;
const createdProductIds: string[] = [];

beforeAll(async () => {
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  categoryId = category.id;
});

afterAll(async () => {
  if (createdProductIds.length > 0) {
    await prisma.inventory.deleteMany({ where: { variant: { productId: { in: createdProductIds } } } });
    await prisma.productVariant.deleteMany({ where: { productId: { in: createdProductIds } } });
    await prisma.productImage.deleteMany({ where: { productId: { in: createdProductIds } } });
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
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

async function createTestProduct(auth: { Authorization: string }): Promise<{ id: string; slug: string }> {
  const suffix = randomUUID().slice(0, 8);
  const res = await request(app)
    .post("/api/v1/admin/products")
    .set(auth)
    .send({ name: `${TEST_PREFIX} Product ${suffix}`, slug: `${TEST_PREFIX}-${suffix}`, categoryId });
  expect(res.status).toBe(201);
  createdProductIds.push(res.body.product.id);
  return { id: res.body.product.id, slug: res.body.product.slug };
}

describe("admin products: RBAC", () => {
  it("403s a customer on /admin/products", async () => {
    const token = await registerCustomer();
    const res = await request(app).get("/api/v1/admin/products").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("403s an order_processing_staff (no MANAGE_CATALOG) on /admin/products", async () => {
    const token = await loginAdmin("orders@woobe.in", "Staff@12345");
    const res = await request(app).get("/api/v1/admin/products").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("allows a product_management_staff to list products", async () => {
    const token = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const res = await request(app).get("/api/v1/admin/products").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe("admin products: CRUD", () => {
  it("creates a product, then reads it back via admin detail and admin list", async () => {
    const token = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${token}` };
    const product = await createTestProduct(auth);

    const getRes = await request(app).get(`/api/v1/admin/products/${product.id}`).set(auth);
    expect(getRes.status).toBe(200);
    expect(getRes.body.product.slug).toBe(product.slug);
    expect(getRes.body.product.variants).toEqual([]);

    // Search matches against Product.name, not slug — see ProductRepository.findAllForAdmin's own `contains` filter.
    const listRes = await request(app).get("/api/v1/admin/products").set(auth).query({ search: TEST_PREFIX });
    expect(listRes.status).toBe(200);
    expect(listRes.body.items.map((p: { id: string }) => p.id)).toContain(product.id);
  });

  it("rejects creating a second product with the same slug", async () => {
    const token = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${token}` };
    const product = await createTestProduct(auth);

    const res = await request(app).post("/api/v1/admin/products").set(auth).send({ name: "Dup", slug: product.slug, categoryId });
    expect(res.status).toBe(409);
  });

  it("updates a product's metadata", async () => {
    const token = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${token}` };
    const product = await createTestProduct(auth);

    const res = await request(app).patch(`/api/v1/admin/products/${product.id}`).set(auth).send({ name: "Renamed", metaTitle: "SEO title" });
    expect(res.status).toBe(200);
    expect(res.body.product.name).toBe("Renamed");
    expect(res.body.product.metaTitle).toBe("SEO title");
  });

  it("deactivates a product — it drops out of the customer-facing listing immediately", async () => {
    const token = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${token}` };
    const product = await createTestProduct(auth);

    const setActiveRes = await request(app).post(`/api/v1/admin/products/${product.id}/active`).set(auth).send({ isActive: false });
    expect(setActiveRes.status).toBe(200);
    expect(setActiveRes.body.product.isActive).toBe(false);

    const publicRes = await request(app).get(`/api/v1/products/${product.slug}`);
    expect(publicRes.status).toBe(404);
  });
});

describe("admin products: variants, pricing cache, and inventory", () => {
  it("creates a variant — computes its price live and initializes a real inventory row", async () => {
    const token = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${token}` };
    const product = await createTestProduct(auth);
    const rate = await prisma.pricingSetting.findFirstOrThrow({ orderBy: { effectiveFrom: "desc" } });

    const res = await request(app)
      .post(`/api/v1/admin/products/${product.id}/variants`)
      .set(auth)
      .send({ sku: `${TEST_PREFIX}-${randomUUID().slice(0, 8)}`, color: "Black", size: "M", weightGrams: 500, initialQuantity: 12 });

    expect(res.status).toBe(201);
    const expectedPrice = Math.round((500 * rate.defaultRatePerKgPaise) / 1000);
    expect(res.body.variant.effectivePricePaiseCache).toBe(expectedPrice);

    const inventory = await prisma.inventory.findFirstOrThrow({ where: { variantId: res.body.variant.id } });
    expect(inventory.quantityAvailable).toBe(12);
    expect(inventory.quantityReserved).toBe(0);

    const productDetail = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(productDetail.minPricePaiseCache).toBe(expectedPrice);
  });

  it("recomputes the price cache and the product's minPrice when a variant's weight changes", async () => {
    const token = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${token}` };
    const product = await createTestProduct(auth);
    const rate = await prisma.pricingSetting.findFirstOrThrow({ orderBy: { effectiveFrom: "desc" } });

    const created = await request(app)
      .post(`/api/v1/admin/products/${product.id}/variants`)
      .set(auth)
      .send({ sku: `${TEST_PREFIX}-${randomUUID().slice(0, 8)}`, color: "Black", size: "M", weightGrams: 500 });

    const updated = await request(app)
      .patch(`/api/v1/admin/products/${product.id}/variants/${created.body.variant.id}`)
      .set(auth)
      .send({ weightGrams: 1000 });

    expect(updated.status).toBe(200);
    const expectedPrice = Math.round((1000 * rate.defaultRatePerKgPaise) / 1000);
    expect(updated.body.variant.effectivePricePaiseCache).toBe(expectedPrice);

    const productDetail = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(productDetail.minPricePaiseCache).toBe(expectedPrice);
  });

  it("excludes a deactivated variant from the product's minPrice recompute", async () => {
    const token = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${token}` };
    const product = await createTestProduct(auth);

    const cheap = await request(app)
      .post(`/api/v1/admin/products/${product.id}/variants`)
      .set(auth)
      .send({ sku: `${TEST_PREFIX}-${randomUUID().slice(0, 8)}`, color: "Black", size: "S", weightGrams: 200 });
    const expensive = await request(app)
      .post(`/api/v1/admin/products/${product.id}/variants`)
      .set(auth)
      .send({ sku: `${TEST_PREFIX}-${randomUUID().slice(0, 8)}`, color: "Black", size: "L", weightGrams: 2000 });

    let productDetail = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(productDetail.minPricePaiseCache).toBe(cheap.body.variant.effectivePricePaiseCache);

    const deactivateRes = await request(app)
      .post(`/api/v1/admin/products/${product.id}/variants/${cheap.body.variant.id}/active`)
      .set(auth)
      .send({ isActive: false });
    expect(deactivateRes.status).toBe(200);

    productDetail = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(productDetail.minPricePaiseCache).toBe(expensive.body.variant.effectivePricePaiseCache);
  });
});

describe("admin products: media", () => {
  it("attaches, reorders, and removes product images", async () => {
    const token = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${token}` };
    const product = await createTestProduct(auth);

    const first = await request(app)
      .post(`/api/v1/admin/products/${product.id}/images`)
      .set(auth)
      .send({ url: "https://placehold.co/800x1000?text=1", altText: "First" });
    const second = await request(app)
      .post(`/api/v1/admin/products/${product.id}/images`)
      .set(auth)
      .send({ url: "https://placehold.co/800x1000?text=2", altText: "Second" });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.image.sortOrder).toBe(0);
    expect(second.body.image.sortOrder).toBe(1);

    const reorderRes = await request(app)
      .put(`/api/v1/admin/products/${product.id}/images/order`)
      .set(auth)
      .send({ imageIds: [second.body.image.id, first.body.image.id] });
    expect(reorderRes.status).toBe(204);

    const detail = await request(app).get(`/api/v1/admin/products/${product.id}`).set(auth);
    expect(detail.body.product.images.map((img: { id: string }) => img.id)).toEqual([second.body.image.id, first.body.image.id]);

    const removeRes = await request(app).delete(`/api/v1/admin/products/${product.id}/images/${first.body.image.id}`).set(auth);
    expect(removeRes.status).toBe(204);

    const finalDetail = await request(app).get(`/api/v1/admin/products/${product.id}`).set(auth);
    expect(finalDetail.body.product.images).toHaveLength(1);
  });
});
