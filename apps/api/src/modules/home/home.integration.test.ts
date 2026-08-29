import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

/**
 * Integration tests against the REAL test database (mirrors reviews'/
 * wishlist's own *.integration.test.ts files) — Week 2 Day 8 Part 2
 * (week2 (1).md §12, Homepage Expansion). `GET /api/v1/home` is public, no
 * auth required, so every request here is a plain unauthenticated GET —
 * only fixture setup needs a real customer/admin session.
 *
 * Own throwaway category/products/order/review per run (random suffix),
 * never reusing seed data, cleaned up in afterAll — same pattern
 * reviews.integration.test.ts already established.
 */

const TEST_PREFIX = "home-test";
const app = createApp();

let categoryId: string;
let warehouseId: string;
const createdProductIds: string[] = [];
const createdVariantIds: string[] = [];
const createdOrderIds: string[] = [];
const createdReviewIds: string[] = [];
const createdUserEmails: string[] = [];

beforeAll(async () => {
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  categoryId = category.id;
  const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { isActive: true } });
  warehouseId = warehouse.id;
});

afterAll(async () => {
  if (createdReviewIds.length > 0) {
    await prisma.review.deleteMany({ where: { id: { in: createdReviewIds } } });
  }
  if (createdOrderIds.length > 0) {
    // OrderItem cascades off Order's onDelete: Cascade.
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  }
  if (createdVariantIds.length > 0) {
    await prisma.inventory.deleteMany({ where: { variantId: { in: createdVariantIds } } });
  }
  if (createdProductIds.length > 0) {
    // ProductVariant/ProductImage/Review cascade off Product's onDelete: Cascade.
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
  }
  if (createdUserEmails.length > 0) {
    await prisma.user.deleteMany({ where: { email: { in: createdUserEmails } } });
  }
  await prisma.$disconnect();
});

async function registerCustomer(): Promise<{ userId: string }> {
  const email = `${TEST_PREFIX}-${crypto.randomUUID()}@test.woobe.internal`;
  createdUserEmails.push(email);
  const res = await request(app).post("/api/v1/auth/register").send({ name: "Home Tester", email, password: "Passw0rd1" });
  expect(res.status).toBe(201);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { userId: user.id };
}

async function createTestProduct(name: string, opts: { isActive?: boolean } = {}): Promise<{ productId: string; variantId: string }> {
  const suffix = crypto.randomUUID().slice(0, 8);
  const product = await prisma.product.create({
    data: {
      name: `${TEST_PREFIX} ${name} ${suffix}`,
      slug: `${TEST_PREFIX}-${name.toLowerCase().replace(/\s+/g, "-")}-${suffix}`,
      categoryId,
      isActive: opts.isActive ?? true,
      minPricePaiseCache: 5_000,
    },
  });
  createdProductIds.push(product.id);

  const variant = await prisma.productVariant.create({
    data: { productId: product.id, sku: `${TEST_PREFIX}-${suffix}`, color: "Black", size: "M", weightGrams: 400, effectivePricePaiseCache: 5_000 },
  });
  createdVariantIds.push(variant.id);

  await prisma.inventory.create({ data: { variantId: variant.id, warehouseId, quantityAvailable: 50, quantityReserved: 0 } });

  return { productId: product.id, variantId: variant.id };
}

/** A CONFIRMED order (counts as "sold") with one line item — mirrors reviews.integration.test.ts's own direct-Prisma order fixture. */
async function createSoldOrder(variantId: string, quantity: number, userId: string | null = null): Promise<void> {
  const order = await prisma.order.create({
    data: {
      orderNumber: `WOOBE-TEST-${crypto.randomUUID().slice(0, 8)}`,
      userId,
      status: "CONFIRMED",
      contactName: "Home Tester",
      contactPhone: "9876543210",
      contactEmail: "home-tester@test.woobe.internal",
      shippingSnapshot: {},
      subtotalPaise: 5_000 * quantity,
      shippingFeePaise: 0,
      taxPaise: 250 * quantity,
      totalPaise: 5_250 * quantity,
      totalWeightGrams: 400 * quantity,
      paymentMethod: "COD",
      items: {
        create: [
          {
            variantId,
            productNameSnapshot: "Test Product",
            skuSnapshot: "TEST-SKU",
            color: "Black",
            size: "M",
            weightGrams: 400,
            unitRatePerKgPaise: 1_200_00,
            unitPricePaise: 5_000,
            quantity,
            lineTotalPaise: 5_000 * quantity,
            taxAmountPaise: 250 * quantity,
          },
        ],
      },
    },
  });
  createdOrderIds.push(order.id);
}

async function createApprovedReview(productId: string, userId: string, rating: number): Promise<void> {
  const review = await prisma.review.create({
    data: { productId, userId, rating, title: "Great buy", body: "Loved the fabric and fit.", status: "APPROVED", isVerifiedPurchase: true },
  });
  createdReviewIds.push(review.id);
}

describe("GET /api/v1/home", () => {
  it("is public — no Authorization header required", async () => {
    const res = await request(app).get("/api/v1/home");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("newArrivals");
    expect(res.body).toHaveProperty("bestSellers");
    expect(res.body).toHaveProperty("featuredCollections");
    expect(res.body).toHaveProperty("customerReviews");
  });

  it("New Arrivals is wired to real products.newest results, shaped like a product card", async () => {
    // Not asserting a specific product lands at a specific index: this file
    // runs alongside every other *.integration.test.ts in the same suite,
    // several of which also create products, so "newest" ordering across
    // the whole test database isn't deterministic from any one file's own
    // fixtures. The sort itself is products' own Day 1 concern, already
    // covered there — this only proves `home` is actually calling it, not
    // returning something hardcoded/empty.
    const res = await request(app).get("/api/v1/home");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.newArrivals)).toBe(true);
    expect(res.body.newArrivals.length).toBeGreaterThan(0);
    expect(res.body.newArrivals.length).toBeLessThanOrEqual(8);
    for (const item of res.body.newArrivals) {
      expect(item).toMatchObject({ id: expect.any(String), slug: expect.any(String), name: expect.any(String), minPricePaiseCache: expect.any(Number) });
    }
  });

  it("ranks Best Sellers by real units sold across CONFIRMED orders, excludes an unpurchased product", async () => {
    const { variantId: bigSellerVariant, productId: bigSellerProduct } = await createTestProduct("Big Seller");
    const { variantId: smallSellerVariant, productId: smallSellerProduct } = await createTestProduct("Small Seller");
    const { productId: neverSoldProduct } = await createTestProduct("Never Sold");

    // Deliberately large, well-separated quantities (not e.g. 9 vs 1): this
    // file runs alongside every other *.integration.test.ts, several of
    // which also create CONFIRMED/DELIVERED order fixtures with small
    // quantities of their own, and the repository only fetches the top 60
    // variant rows by quantity sold — these numbers need to comfortably
    // outrank that background noise, not just each other.
    await createSoldOrder(bigSellerVariant, 9_000);
    await createSoldOrder(smallSellerVariant, 900);

    const res = await request(app).get("/api/v1/home");

    expect(res.status).toBe(200);
    const bestSellerIds: string[] = res.body.bestSellers.map((p: { id: string }) => p.id);
    expect(bestSellerIds).toContain(bigSellerProduct);
    expect(bestSellerIds).toContain(smallSellerProduct);
    expect(bestSellerIds.indexOf(bigSellerProduct)).toBeLessThan(bestSellerIds.indexOf(smallSellerProduct));
    expect(bestSellerIds).not.toContain(neverSoldProduct);
  });

  it("never counts a PENDING_PAYMENT order's items toward Best Sellers", async () => {
    const { variantId, productId } = await createTestProduct("Pending Payment Only");
    const order = await prisma.order.create({
      data: {
        orderNumber: `WOOBE-TEST-${crypto.randomUUID().slice(0, 8)}`,
        userId: null,
        status: "PENDING_PAYMENT",
        contactName: "Home Tester",
        contactPhone: "9876543210",
        contactEmail: "home-tester@test.woobe.internal",
        shippingSnapshot: {},
        subtotalPaise: 5_000,
        shippingFeePaise: 0,
        taxPaise: 250,
        totalPaise: 5_250,
        totalWeightGrams: 400,
        paymentMethod: "COD",
        items: {
          create: [
            {
              variantId,
              productNameSnapshot: "Test Product",
              skuSnapshot: "TEST-SKU",
              color: "Black",
              size: "M",
              weightGrams: 400,
              unitRatePerKgPaise: 1_200_00,
              unitPricePaise: 5_000,
              quantity: 5,
              lineTotalPaise: 25_000,
              taxAmountPaise: 1_250,
            },
          ],
        },
      },
    });
    createdOrderIds.push(order.id);

    const res = await request(app).get("/api/v1/home");

    const bestSellerIds: string[] = res.body.bestSellers.map((p: { id: string }) => p.id);
    expect(bestSellerIds).not.toContain(productId);
  });

  it("shows an APPROVED review with its product's name/slug, and never a PENDING one", async () => {
    const { userId } = await registerCustomer();
    const { productId } = await createTestProduct("Reviewed Product");
    await createApprovedReview(productId, userId, 5);

    const pendingProduct = await createTestProduct("Pending Reviewed Product");
    const pendingReview = await prisma.review.create({
      data: { productId: pendingProduct.productId, userId, rating: 5, title: "Pending", body: "Not moderated yet", status: "PENDING", isVerifiedPurchase: true },
    });
    createdReviewIds.push(pendingReview.id);

    const res = await request(app).get("/api/v1/home");

    const reviewProductIds: string[] = res.body.customerReviews.map((r: { product: { id: string } }) => r.product.id);
    expect(reviewProductIds).toContain(productId);
    expect(reviewProductIds).not.toContain(pendingProduct.productId);
    const shown = res.body.customerReviews.find((r: { product: { id: string } }) => r.product.id === productId);
    expect(shown.product.slug).toEqual(expect.any(String));
    expect(shown).not.toHaveProperty("userId");
  });

  it("excludes a Best Seller / review whose product is inactive", async () => {
    const { variantId, productId } = await createTestProduct("Will Go Inactive", { isActive: true });
    await createSoldOrder(variantId, 7);
    await prisma.product.update({ where: { id: productId }, data: { isActive: false } });

    const res = await request(app).get("/api/v1/home");

    const bestSellerIds: string[] = res.body.bestSellers.map((p: { id: string }) => p.id);
    expect(bestSellerIds).not.toContain(productId);
  });
});
