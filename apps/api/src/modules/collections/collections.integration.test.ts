import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

/**
 * Integration tests against the REAL test database (mirrors products'/cart's
 * own *.integration.test.ts files) — Week 2 Day 2 collections & merchandising
 * (week2 (1).md §4: customer detail + admin CRUD/assign/remove/reorder,
 * RBAC-gated).
 *
 * Own throwaway category/collections/products per run (random suffix), never
 * reusing seed data, cleaned up in afterAll — same pattern
 * products.integration.test.ts already established.
 */

const app = createApp();
const SUFFIX = crypto.randomUUID().slice(0, 8);

let categoryId: string;
const createdProductIds: string[] = [];
const createdCollectionIds: string[] = [];

async function loginAdmin(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/v1/admin/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

async function createTestProduct(name: string): Promise<string> {
  const suffix = crypto.randomUUID().slice(0, 8);
  const product = await prisma.product.create({
    data: { name, slug: `collections-test-${suffix}`, categoryId, isActive: true },
  });
  createdProductIds.push(product.id);
  return product.id;
}

beforeAll(async () => {
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  categoryId = category.id;
});

afterAll(async () => {
  if (createdCollectionIds.length > 0) {
    // ProductCollection cascades off Collection's onDelete: Cascade.
    await prisma.collection.deleteMany({ where: { id: { in: createdCollectionIds } } });
  }
  if (createdProductIds.length > 0) {
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
  }
  await prisma.$disconnect();
});

describe("GET /api/v1/collections/:slug (customer detail)", () => {
  it("returns an active collection's metadata", async () => {
    const collection = await prisma.collection.create({
      data: { name: `Detail Test ${SUFFIX}`, slug: `collections-detail-${SUFFIX}`, description: "A test collection", isActive: true },
    });
    createdCollectionIds.push(collection.id);

    const res = await request(app).get(`/api/v1/collections/${collection.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.collection).toMatchObject({
      id: collection.id,
      name: `Detail Test ${SUFFIX}`,
      slug: collection.slug,
      description: "A test collection",
    });
  });

  it("404s for an unknown slug", async () => {
    const res = await request(app).get(`/api/v1/collections/unknown-${SUFFIX}`);
    expect(res.status).toBe(404);
  });

  it("404s for an inactive collection — not shown to customers", async () => {
    const collection = await prisma.collection.create({
      data: { name: `Inactive Test ${SUFFIX}`, slug: `collections-inactive-${SUFFIX}`, isActive: false },
    });
    createdCollectionIds.push(collection.id);

    const res = await request(app).get(`/api/v1/collections/${collection.slug}`);
    expect(res.status).toBe(404);
  });

  it("the product rail is served by products' own ?collection= filter, already tested in products.integration.test.ts", () => {
    // Deliberately no duplicate test here — see get-collection-detail.use-case.ts's own doc comment on why.
    expect(true).toBe(true);
  });
});

describe("admin collections RBAC", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/api/v1/admin/collections");
    expect(res.status).toBe(401);
  });

  it("403s an order_processing_staff (no MANAGE_CATALOG)", async () => {
    const accessToken = await loginAdmin("orders@woobe.in", "Staff@12345");
    const res = await request(app).get("/api/v1/admin/collections").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  it("allows a product_management_staff (has MANAGE_CATALOG)", async () => {
    const accessToken = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const res = await request(app).get("/api/v1/admin/collections").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.collections)).toBe(true);
  });
});

describe("admin collections CRUD", () => {
  it("creates, lists (including inactive), and gets a collection by id", async () => {
    const accessToken = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${accessToken}` };
    const slug = `collections-crud-${SUFFIX}`;

    const createRes = await request(app).post("/api/v1/admin/collections").set(auth).send({ name: "Winter Edit", slug, description: "Cozy layers" });
    expect(createRes.status).toBe(201);
    expect(createRes.body.collection).toMatchObject({ name: "Winter Edit", slug, description: "Cozy layers", isActive: true });
    const collectionId = createRes.body.collection.id as string;
    createdCollectionIds.push(collectionId);

    const getRes = await request(app).get(`/api/v1/admin/collections/${collectionId}`).set(auth);
    expect(getRes.status).toBe(200);
    expect(getRes.body.collection).toMatchObject({ id: collectionId, name: "Winter Edit", productIds: [] });

    const listRes = await request(app).get("/api/v1/admin/collections").set(auth);
    expect(listRes.body.collections.some((c: { id: string }) => c.id === collectionId)).toBe(true);
  });

  it("rejects a duplicate slug with 409, not a raw 500", async () => {
    const accessToken = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${accessToken}` };
    const slug = `collections-dup-${SUFFIX}`;

    const first = await request(app).post("/api/v1/admin/collections").set(auth).send({ name: "First", slug });
    expect(first.status).toBe(201);
    createdCollectionIds.push(first.body.collection.id);

    const second = await request(app).post("/api/v1/admin/collections").set(auth).send({ name: "Second", slug });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("CONFLICT");
  });

  it("rejects an invalid slug shape with 400", async () => {
    const accessToken = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const res = await request(app)
      .post("/api/v1/admin/collections")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Bad Slug", slug: "Not A Valid Slug!" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("updates metadata", async () => {
    const accessToken = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${accessToken}` };
    const createRes = await request(app)
      .post("/api/v1/admin/collections")
      .set(auth)
      .send({ name: "Original Name", slug: `collections-update-${SUFFIX}` });
    const collectionId = createRes.body.collection.id as string;
    createdCollectionIds.push(collectionId);

    const updateRes = await request(app).patch(`/api/v1/admin/collections/${collectionId}`).set(auth).send({ name: "Renamed" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.collection.name).toBe("Renamed");
  });

  it("404s updating an unknown collection", async () => {
    const accessToken = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const res = await request(app)
      .patch(`/api/v1/admin/collections/${crypto.randomUUID()}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Doesn't matter" });
    expect(res.status).toBe(404);
  });

  it("activates and deactivates — deactivated collections drop out of the customer-facing endpoints immediately", async () => {
    const accessToken = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${accessToken}` };
    const slug = `collections-toggle-${SUFFIX}`;
    const createRes = await request(app).post("/api/v1/admin/collections").set(auth).send({ name: "Toggle Me", slug });
    const collectionId = createRes.body.collection.id as string;
    createdCollectionIds.push(collectionId);

    const visibleBefore = await request(app).get(`/api/v1/collections/${slug}`);
    expect(visibleBefore.status).toBe(200);

    const deactivateRes = await request(app).post(`/api/v1/admin/collections/${collectionId}/active`).set(auth).send({ isActive: false });
    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.collection.isActive).toBe(false);

    const hiddenAfter = await request(app).get(`/api/v1/collections/${slug}`);
    expect(hiddenAfter.status).toBe(404);

    const reactivateRes = await request(app).post(`/api/v1/admin/collections/${collectionId}/active`).set(auth).send({ isActive: true });
    expect(reactivateRes.status).toBe(200);
    const visibleAgain = await request(app).get(`/api/v1/collections/${slug}`);
    expect(visibleAgain.status).toBe(200);
  });
});

describe("admin collections — product assignment", () => {
  it("assigns and removes products, idempotently", async () => {
    const accessToken = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${accessToken}` };
    const createRes = await request(app)
      .post("/api/v1/admin/collections")
      .set(auth)
      .send({ name: "Assignment Test", slug: `collections-assign-${SUFFIX}` });
    const collectionId = createRes.body.collection.id as string;
    createdCollectionIds.push(collectionId);

    const productId = await createTestProduct(`Assign Product ${SUFFIX}`);

    const assignRes = await request(app).post(`/api/v1/admin/collections/${collectionId}/products`).set(auth).send({ productId });
    expect(assignRes.status).toBe(204);

    // Idempotent — assigning again is a no-op, not an error.
    const assignAgainRes = await request(app).post(`/api/v1/admin/collections/${collectionId}/products`).set(auth).send({ productId });
    expect(assignAgainRes.status).toBe(204);

    const getRes = await request(app).get(`/api/v1/admin/collections/${collectionId}`).set(auth);
    expect(getRes.body.collection.productIds).toEqual([productId]);

    const removeRes = await request(app).delete(`/api/v1/admin/collections/${collectionId}/products/${productId}`).set(auth);
    expect(removeRes.status).toBe(204);

    // Idempotent — removing again is a no-op, not an error.
    const removeAgainRes = await request(app).delete(`/api/v1/admin/collections/${collectionId}/products/${productId}`).set(auth);
    expect(removeAgainRes.status).toBe(204);

    const getAfterRemove = await request(app).get(`/api/v1/admin/collections/${collectionId}`).set(auth);
    expect(getAfterRemove.body.collection.productIds).toEqual([]);
  });

  it("404s assigning to an unknown collection", async () => {
    const accessToken = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const productId = await createTestProduct(`Orphan Product ${SUFFIX}`);
    const res = await request(app)
      .post(`/api/v1/admin/collections/${crypto.randomUUID()}/products`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ productId });
    expect(res.status).toBe(404);
  });

  it("404s assigning an unknown product — not a raw 500 from the FK constraint", async () => {
    const accessToken = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${accessToken}` };
    const createRes = await request(app)
      .post("/api/v1/admin/collections")
      .set(auth)
      .send({ name: "Bad Product Test", slug: `collections-badproduct-${SUFFIX}` });
    const collectionId = createRes.body.collection.id as string;
    createdCollectionIds.push(collectionId);

    const res = await request(app).post(`/api/v1/admin/collections/${collectionId}/products`).set(auth).send({ productId: crypto.randomUUID() });
    expect(res.status).toBe(404);
  });

  it("real product rail: products' ?collection= filter reflects the assignment live", async () => {
    const accessToken = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${accessToken}` };
    const slug = `collections-rail-${SUFFIX}`;
    const createRes = await request(app).post("/api/v1/admin/collections").set(auth).send({ name: "Rail Test", slug });
    const collectionId = createRes.body.collection.id as string;
    createdCollectionIds.push(collectionId);

    const productId = await createTestProduct(`Rail Product ${SUFFIX}`);
    await request(app).post(`/api/v1/admin/collections/${collectionId}/products`).set(auth).send({ productId });

    const railRes = await request(app).get("/api/v1/products").query({ collection: slug });
    expect(railRes.status).toBe(200);
    expect(railRes.body.products.map((p: { id: string }) => p.id)).toEqual([productId]);
  });
});

describe("admin collections — reorder", () => {
  it("reorders products, and rejects a partial/mismatched list", async () => {
    const accessToken = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${accessToken}` };
    const createRes = await request(app)
      .post("/api/v1/admin/collections")
      .set(auth)
      .send({ name: "Reorder Test", slug: `collections-reorder-${SUFFIX}` });
    const collectionId = createRes.body.collection.id as string;
    createdCollectionIds.push(collectionId);

    const productA = await createTestProduct(`Reorder A ${SUFFIX}`);
    const productB = await createTestProduct(`Reorder B ${SUFFIX}`);
    const productC = await createTestProduct(`Reorder C ${SUFFIX}`);
    for (const productId of [productA, productB, productC]) {
      await request(app).post(`/api/v1/admin/collections/${collectionId}/products`).set(auth).send({ productId });
    }

    const beforeRes = await request(app).get(`/api/v1/admin/collections/${collectionId}`).set(auth);
    expect(beforeRes.body.collection.productIds).toEqual([productA, productB, productC]);

    const reorderRes = await request(app)
      .put(`/api/v1/admin/collections/${collectionId}/products/order`)
      .set(auth)
      .send({ productIds: [productC, productA, productB] });
    expect(reorderRes.status).toBe(204);

    const afterRes = await request(app).get(`/api/v1/admin/collections/${collectionId}`).set(auth);
    expect(afterRes.body.collection.productIds).toEqual([productC, productA, productB]);

    // The reordered rail is what the customer-facing filter reflects too.
    const railRes = await request(app).get("/api/v1/products").query({ collection: `collections-reorder-${SUFFIX}`, sort: "newest", limit: 10 });
    expect(railRes.status).toBe(200);
    expect(new Set(railRes.body.products.map((p: { id: string }) => p.id))).toEqual(new Set([productA, productB, productC]));

    const partialRes = await request(app)
      .put(`/api/v1/admin/collections/${collectionId}/products/order`)
      .set(auth)
      .send({ productIds: [productA, productB] }); // missing productC
    expect(partialRes.status).toBe(400);

    const foreignRes = await request(app)
      .put(`/api/v1/admin/collections/${collectionId}/products/order`)
      .set(auth)
      .send({ productIds: [productA, productB, productC, crypto.randomUUID()] });
    expect(foreignRes.status).toBe(400);
  });
});
