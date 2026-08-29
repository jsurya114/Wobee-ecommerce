import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

/**
 * Integration tests against the REAL test database (mirrors collections'/
 * wishlist's own *.integration.test.ts files) — Week 2 Day 4 Reviews &
 * Ratings (week2 (1).md §8's own test list: eligibility, authorization,
 * rating validation, moderation, rating aggregation).
 */

const TEST_PREFIX = "reviews-test";
const app = createApp();

let categoryId: string;
const createdUserEmails: string[] = [];
const createdProductIds: string[] = [];
const createdOrderIds: string[] = [];

beforeAll(async () => {
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  categoryId = category.id;
});

afterAll(async () => {
  if (createdOrderIds.length > 0) {
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  }
  if (createdProductIds.length > 0) {
    // Review/ProductVariant cascade off Product's onDelete: Cascade.
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
  }
  if (createdUserEmails.length > 0) {
    await prisma.user.deleteMany({ where: { email: { in: createdUserEmails } } });
  }
  await prisma.$disconnect();
});

async function registerCustomer(name = "Reviews Tester"): Promise<{ accessToken: string; userId: string; email: string }> {
  const email = `${TEST_PREFIX}-${crypto.randomUUID()}@test.woobe.internal`;
  createdUserEmails.push(email);
  const res = await request(app).post("/api/v1/auth/register").send({ name, email, password: "Passw0rd1" });
  expect(res.status).toBe(201);
  return { accessToken: res.body.accessToken as string, userId: res.body.user.id as string, email };
}

async function loginStaff(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/v1/admin/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

async function createTestProduct(): Promise<{ productId: string; variantId: string }> {
  const suffix = crypto.randomUUID().slice(0, 8);
  const product = await prisma.product.create({
    data: { name: `${TEST_PREFIX} Product ${suffix}`, slug: `${TEST_PREFIX}-${suffix}`, categoryId, isActive: true, minPricePaiseCache: 10_000 },
  });
  createdProductIds.push(product.id);
  const variant = await prisma.productVariant.create({
    data: { productId: product.id, sku: `${TEST_PREFIX}-${suffix}`, color: "Black", size: "M", weightGrams: 500, isActive: true, effectivePricePaiseCache: 10_000 },
  });
  return { productId: product.id, variantId: variant.id };
}

/** Directly creates a CONFIRMED order containing this variant — the verified-purchase check's own fixture, not a re-test of checkout's own flow (orders.integration.test.ts already covers that). */
async function createConfirmedOrder(userId: string, variantId: string): Promise<void> {
  const order = await prisma.order.create({
    data: {
      orderNumber: `WOOBE-TEST-${crypto.randomUUID().slice(0, 8)}`,
      userId,
      status: "CONFIRMED",
      contactName: "Reviews Tester",
      contactPhone: "9876543210",
      contactEmail: "reviews-tester@test.woobe.internal",
      shippingSnapshot: {},
      subtotalPaise: 10_000,
      shippingFeePaise: 0,
      taxPaise: 500,
      totalPaise: 10_500,
      totalWeightGrams: 500,
      paymentMethod: "COD",
      items: {
        create: [
          {
            variantId,
            productNameSnapshot: "Test Product",
            skuSnapshot: "TEST-SKU",
            color: "Black",
            size: "M",
            weightGrams: 500,
            unitRatePerKgPaise: 1_200_00,
            unitPricePaise: 10_000,
            quantity: 1,
            lineTotalPaise: 10_000,
            taxAmountPaise: 500,
          },
        ],
      },
    },
  });
  createdOrderIds.push(order.id);
}

describe("reviews: submit + validation", () => {
  it("submits a review, starting PENDING with isVerifiedPurchase false when the user never bought the product", async () => {
    const { accessToken } = await registerCustomer();
    const { productId } = await createTestProduct();
    const res = await request(app)
      .post("/api/v1/reviews")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ productId, rating: 5, title: "Lovely", body: "Great quality" });
    expect(res.status).toBe(201);
    expect(res.body.review.status).toBe("PENDING");
    expect(res.body.review.isVerifiedPurchase).toBe(false);
  });

  it("marks isVerifiedPurchase true when the user has a CONFIRMED order containing this product", async () => {
    const { accessToken, userId } = await registerCustomer();
    const { productId, variantId } = await createTestProduct();
    await createConfirmedOrder(userId, variantId);

    const res = await request(app)
      .post("/api/v1/reviews")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ productId, rating: 4 });
    expect(res.status).toBe(201);
    expect(res.body.review.isVerifiedPurchase).toBe(true);
  });

  it("rejects an out-of-range rating with 400, not a raw 500", async () => {
    const { accessToken } = await registerCustomer();
    const { productId } = await createTestProduct();
    const tooLow = await request(app).post("/api/v1/reviews").set("Authorization", `Bearer ${accessToken}`).send({ productId, rating: 0 });
    const tooHigh = await request(app).post("/api/v1/reviews").set("Authorization", `Bearer ${accessToken}`).send({ productId, rating: 6 });
    expect(tooLow.status).toBe(400);
    expect(tooHigh.status).toBe(400);
  });

  it("rejects a review for an unknown product with 404", async () => {
    const { accessToken } = await registerCustomer();
    const res = await request(app)
      .post("/api/v1/reviews")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ productId: crypto.randomUUID(), rating: 5 });
    expect(res.status).toBe(404);
  });

  it("prevents a duplicate review for the same product by the same user — 409, not a raw 500", async () => {
    const { accessToken } = await registerCustomer();
    const { productId } = await createTestProduct();
    const first = await request(app).post("/api/v1/reviews").set("Authorization", `Bearer ${accessToken}`).send({ productId, rating: 5 });
    expect(first.status).toBe(201);
    const second = await request(app).post("/api/v1/reviews").set("Authorization", `Bearer ${accessToken}`).send({ productId, rating: 3 });
    expect(second.status).toBe(409);
  });

  it("rejects submission from an unauthenticated caller with 401", async () => {
    const { productId } = await createTestProduct();
    const res = await request(app).post("/api/v1/reviews").send({ productId, rating: 5 });
    expect(res.status).toBe(401);
  });
});

describe("reviews: public listing + rating aggregation", () => {
  it("a PENDING review is invisible on the public listing and excluded from the rating summary", async () => {
    const { accessToken } = await registerCustomer();
    const { productId } = await createTestProduct();
    await request(app).post("/api/v1/reviews").set("Authorization", `Bearer ${accessToken}`).send({ productId, rating: 5 });

    const res = await request(app).get("/api/v1/reviews").query({ productId });
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
    expect(res.body.ratingSummary).toEqual({ averageRating: 0, reviewCount: 0, breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
  });

  it("an APPROVED review appears publicly and is counted in the rating summary", async () => {
    const { accessToken } = await registerCustomer();
    const { productId } = await createTestProduct();
    const submitted = await request(app).post("/api/v1/reviews").set("Authorization", `Bearer ${accessToken}`).send({ productId, rating: 4 });
    const staffToken = await loginStaff("catalog@woobe.in", "Staff@12345");
    await request(app)
      .post(`/api/v1/admin/reviews/${submitted.body.review.id}/approve`)
      .set("Authorization", `Bearer ${staffToken}`);

    const res = await request(app).get("/api/v1/reviews").query({ productId });
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].status).toBe("APPROVED");
    expect(res.body.ratingSummary).toEqual({ averageRating: 4, reviewCount: 1, breakdown: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 0 } });
  });

  it("rejects an unknown/malformed productId query with 400", async () => {
    const res = await request(app).get("/api/v1/reviews").query({ productId: "not-a-uuid" });
    expect(res.status).toBe(400);
  });
});

describe("reviews: edit / delete own review", () => {
  it("editing an own review resets it to PENDING for re-moderation", async () => {
    const { accessToken } = await registerCustomer();
    const { productId } = await createTestProduct();
    const submitted = await request(app).post("/api/v1/reviews").set("Authorization", `Bearer ${accessToken}`).send({ productId, rating: 3 });
    const staffToken = await loginStaff("catalog@woobe.in", "Staff@12345");
    await request(app).post(`/api/v1/admin/reviews/${submitted.body.review.id}/approve`).set("Authorization", `Bearer ${staffToken}`);

    const edited = await request(app)
      .patch(`/api/v1/reviews/${submitted.body.review.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ rating: 5, body: "Actually, even better than I thought" });
    expect(edited.status).toBe(200);
    expect(edited.body.review.status).toBe("PENDING");
    expect(edited.body.review.rating).toBe(5);
  });

  it("deletes an own review", async () => {
    const { accessToken } = await registerCustomer();
    const { productId } = await createTestProduct();
    const submitted = await request(app).post("/api/v1/reviews").set("Authorization", `Bearer ${accessToken}`).send({ productId, rating: 3 });
    const res = await request(app).delete(`/api/v1/reviews/${submitted.body.review.id}`).set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(204);
  });

  it("customer B cannot edit or delete customer A's review (404, not success)", async () => {
    const customerA = await registerCustomer();
    const customerB = await registerCustomer();
    const { productId } = await createTestProduct();
    const submitted = await request(app)
      .post("/api/v1/reviews")
      .set("Authorization", `Bearer ${customerA.accessToken}`)
      .send({ productId, rating: 3 });

    const editRes = await request(app)
      .patch(`/api/v1/reviews/${submitted.body.review.id}`)
      .set("Authorization", `Bearer ${customerB.accessToken}`)
      .send({ rating: 1 });
    expect(editRes.status).toBe(404);

    const deleteRes = await request(app)
      .delete(`/api/v1/reviews/${submitted.body.review.id}`)
      .set("Authorization", `Bearer ${customerB.accessToken}`);
    expect(deleteRes.status).toBe(404);
  });
});

describe("reviews: admin moderation + authorization", () => {
  it("lists reviews of every status for admin, filterable by status", async () => {
    const { accessToken } = await registerCustomer();
    const { productId } = await createTestProduct();
    await request(app).post("/api/v1/reviews").set("Authorization", `Bearer ${accessToken}`).send({ productId, rating: 2 });
    const staffToken = await loginStaff("catalog@woobe.in", "Staff@12345");

    const res = await request(app).get("/api/v1/admin/reviews").query({ status: "PENDING" }).set("Authorization", `Bearer ${staffToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items.some((r: { productId: string }) => r.productId === productId)).toBe(true);
  });

  it("rejects/hides a review, both removing it from the public listing", async () => {
    const { accessToken } = await registerCustomer();
    const { productId } = await createTestProduct();
    const submitted = await request(app).post("/api/v1/reviews").set("Authorization", `Bearer ${accessToken}`).send({ productId, rating: 1 });
    const staffToken = await loginStaff("catalog@woobe.in", "Staff@12345");

    const rejectRes = await request(app)
      .post(`/api/v1/admin/reviews/${submitted.body.review.id}/reject`)
      .set("Authorization", `Bearer ${staffToken}`);
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.review.status).toBe("REJECTED");

    const publicListing = await request(app).get("/api/v1/reviews").query({ productId });
    expect(publicListing.body.items).toHaveLength(0);
  });

  it("hides a previously-approved review, removing it from the public listing", async () => {
    const { accessToken } = await registerCustomer();
    const { productId } = await createTestProduct();
    const submitted = await request(app).post("/api/v1/reviews").set("Authorization", `Bearer ${accessToken}`).send({ productId, rating: 5 });
    const staffToken = await loginStaff("catalog@woobe.in", "Staff@12345");
    await request(app).post(`/api/v1/admin/reviews/${submitted.body.review.id}/approve`).set("Authorization", `Bearer ${staffToken}`);

    const hideRes = await request(app).post(`/api/v1/admin/reviews/${submitted.body.review.id}/hide`).set("Authorization", `Bearer ${staffToken}`);
    expect(hideRes.status).toBe(200);
    expect(hideRes.body.review.status).toBe("HIDDEN");

    const publicListing = await request(app).get("/api/v1/reviews").query({ productId });
    expect(publicListing.body.items).toHaveLength(0);
  });

  it("403s an order_processing_staff (no MANAGE_CATALOG) from the moderation routes", async () => {
    const staffToken = await loginStaff("orders@woobe.in", "Staff@12345");
    const res = await request(app).get("/api/v1/admin/reviews").set("Authorization", `Bearer ${staffToken}`);
    expect(res.status).toBe(403);
  });

  it("404s moderating an unknown review id", async () => {
    const staffToken = await loginStaff("catalog@woobe.in", "Staff@12345");
    const res = await request(app).post(`/api/v1/admin/reviews/${crypto.randomUUID()}/approve`).set("Authorization", `Bearer ${staffToken}`);
    expect(res.status).toBe(404);
  });
});
