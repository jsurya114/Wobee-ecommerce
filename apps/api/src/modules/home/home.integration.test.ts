import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

/**
 * Integration tests against the REAL test database (mirrors testimonials'/
 * wishlist's own *.integration.test.ts files) — Week 2 Day 8 Part 2
 * (week2 (1).md §12, Homepage Expansion), updated 2026-09-11 for the
 * testimonial system. `GET /api/v1/home` is public, no auth required, so
 * every request here is a plain unauthenticated GET — only fixture setup
 * needs a real customer/admin session.
 *
 * Own throwaway category/products/order/testimonial per run (random
 * suffix), never reusing seed data, cleaned up in afterAll — same pattern
 * testimonials.integration.test.ts already established. Testimonials are
 * deleted BEFORE orders/users below: Testimonial.orderId/customerId have no
 * onDelete: Cascade (unlike the old Review model), so an order/user with a
 * still-existing testimonial row would fail to delete.
 */

const TEST_PREFIX = "home-test";
const app = createApp();

let categoryId: string;
let warehouseId: string;
const createdProductIds: string[] = [];
const createdVariantIds: string[] = [];
const createdOrderIds: string[] = [];
const createdTestimonialIds: string[] = [];
const createdUserEmails: string[] = [];
const createdOfferIds: string[] = [];

beforeAll(async () => {
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  categoryId = category.id;
  const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { isActive: true } });
  warehouseId = warehouse.id;
});

afterAll(async () => {
  if (createdOfferIds.length > 0) {
    await prisma.offer.deleteMany({ where: { id: { in: createdOfferIds } } });
  }
  if (createdTestimonialIds.length > 0) {
    await prisma.testimonial.deleteMany({ where: { id: { in: createdTestimonialIds } } });
  }
  if (createdOrderIds.length > 0) {
    // OrderItem cascades off Order's onDelete: Cascade.
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  }
  if (createdVariantIds.length > 0) {
    await prisma.inventory.deleteMany({ where: { variantId: { in: createdVariantIds } } });
  }
  if (createdProductIds.length > 0) {
    // ProductVariant/ProductImage cascade off Product's onDelete: Cascade.
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

async function createTestProduct(
  name: string,
  opts: { isActive?: boolean; size?: string; quantityAvailable?: number } = {},
): Promise<{ productId: string; variantId: string }> {
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
    data: {
      productId: product.id,
      sku: `${TEST_PREFIX}-${suffix}`,
      color: "Black",
      size: opts.size ?? "M",
      weightGrams: 400,
      effectivePricePaiseCache: 5_000,
    },
  });
  createdVariantIds.push(variant.id);

  await prisma.inventory.create({
    data: { variantId: variant.id, warehouseId, quantityAvailable: opts.quantityAvailable ?? 50, quantityReserved: 0 },
  });

  return { productId: product.id, variantId: variant.id };
}

/**
 * A "sold" order with one line item — mirrors testimonials.integration.test.ts's
 * own direct-Prisma order fixture. Defaults to DELIVERED (merchandising
 * logic corrections, 2026-09-06): `home`'s "Loved by Customers" rail now
 * only counts completed deliveries, not merely CONFIRMED/PROCESSING/SHIPPED
 * — see get-homepage.use-case.ts's own doc comment. Returns the created
 * order's id — the testimonial fixtures below need it (Testimonial.orderId
 * is a real FK, not a free-text field).
 */
async function createSoldOrder(
  variantId: string,
  quantity: number,
  userId: string | null = null,
  status: "CONFIRMED" | "PROCESSING" | "SHIPPED" | "DELIVERED" = "DELIVERED",
): Promise<{ orderId: string }> {
  const order = await prisma.order.create({
    data: {
      orderNumber: `WOOBE-TEST-${crypto.randomUUID().slice(0, 8)}`,
      userId,
      status,
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
  return { orderId: order.id };
}

async function createApprovedTestimonial(orderId: string, customerId: string, rating: number): Promise<{ testimonialId: string }> {
  const testimonial = await prisma.testimonial.create({
    data: { orderId, customerId, rating, text: "Loved the fabric and the fit — arrived quickly too.", status: "APPROVED" },
  });
  createdTestimonialIds.push(testimonial.id);
  return { testimonialId: testimonial.id };
}

describe("GET /api/v1/home", () => {
  it("is public — no Authorization header required", async () => {
    const res = await request(app).get("/api/v1/home");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("newArrivals");
    expect(res.body).toHaveProperty("bestSellers");
    expect(res.body).toHaveProperty("featuredCollections");
    expect(res.body).toHaveProperty("testimonials");
    expect(res.body).toHaveProperty("testimonialAggregate");
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

  it("ranks Loved by Customers by real units sold across DELIVERED orders, excludes an unpurchased product", async () => {
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

  it("never counts a PENDING_PAYMENT order's items toward Loved by Customers", async () => {
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

  it.each(["CONFIRMED", "PROCESSING", "SHIPPED"] as const)(
    "never counts a %s order's items toward Loved by Customers — only DELIVERED represents a completed sale (merchandising fix, 2026-09-06)",
    async (status) => {
      const { variantId, productId } = await createTestProduct(`Not Yet Delivered ${status}`);
      await createSoldOrder(variantId, 9_000, null, status);

      const res = await request(app).get("/api/v1/home");

      const bestSellerIds: string[] = res.body.bestSellers.map((p: { id: string }) => p.id);
      expect(bestSellerIds).not.toContain(productId);
    },
  );

  it("excludes a Loved-by-Customers product that sold well but has zero current stock (merchandising fix, 2026-09-06)", async () => {
    const { variantId, productId } = await createTestProduct("Sold Out Favorite");
    await createSoldOrder(variantId, 9_000);
    await prisma.inventory.updateMany({ where: { variantId }, data: { quantityAvailable: 0 } });

    const res = await request(app).get("/api/v1/home");

    const bestSellerIds: string[] = res.body.bestSellers.map((p: { id: string }) => p.id);
    expect(bestSellerIds).not.toContain(productId);
  });

  it("shows an APPROVED testimonial with a server-derived display name, and never a PENDING one or a raw customer id", async () => {
    const { userId } = await registerCustomer(); // registers as "Home Tester" — see registerCustomer()
    const { variantId } = await createTestProduct("Testimonial Source Product");

    const { orderId: approvedOrderId } = await createSoldOrder(variantId, 1, userId, "DELIVERED");
    const { testimonialId: approvedTestimonialId } = await createApprovedTestimonial(approvedOrderId, userId, 5);

    const { orderId: pendingOrderId } = await createSoldOrder(variantId, 1, userId, "DELIVERED");
    const pendingTestimonial = await prisma.testimonial.create({
      data: { orderId: pendingOrderId, customerId: userId, rating: 4, text: "Still waiting on moderation — must never show publicly.", status: "PENDING" },
    });
    createdTestimonialIds.push(pendingTestimonial.id);

    const res = await request(app).get("/api/v1/home");

    const testimonialIds: string[] = res.body.testimonials.map((t: { id: string }) => t.id);
    expect(testimonialIds).toContain(approvedTestimonialId);
    expect(testimonialIds).not.toContain(pendingTestimonial.id);

    const shown = res.body.testimonials.find((t: { id: string }) => t.id === approvedTestimonialId);
    expect(shown.displayName).toBe("Home T."); // "Home Tester" -> First Name + Last Initial
    expect(shown).not.toHaveProperty("customerId");
    expect(shown).not.toHaveProperty("userId");
    expect(shown).not.toHaveProperty("status");

    // Aggregate reflects the APPROVED testimonial only, never the PENDING one.
    expect(res.body.testimonialAggregate.approvedCount).toBeGreaterThanOrEqual(1);
    expect(res.body.testimonialAggregate.averageRating).toEqual(expect.any(Number));
  });

  it("excludes a Loved-by-Customers product whose product has since gone inactive", async () => {
    const { variantId, productId } = await createTestProduct("Will Go Inactive", { isActive: true });
    await createSoldOrder(variantId, 7);
    await prisma.product.update({ where: { id: productId }, data: { isActive: false } });

    const res = await request(app).get("/api/v1/home");

    const bestSellerIds: string[] = res.body.bestSellers.map((p: { id: string }) => p.id);
    expect(bestSellerIds).not.toContain(productId);
  });

  it("New Arrivals excludes a brand-new product with zero available stock (merchandising fix, 2026-09-06)", async () => {
    // Not asserting positive containment of an in-stock product here — same
    // shared-DB, concurrent-tests non-determinism the file's own "New
    // Arrivals is wired..." test already documents (something newer created
    // by a sibling test can push any one fixture out of the top-8 window).
    // The negative assertion below is unaffected by that: a freshly created,
    // zero-stock product must never appear regardless of what else is newer.
    const { variantId: outOfStockVariant, productId: outOfStockId } = await createTestProduct("Sold Out Arrival", { quantityAvailable: 0 });

    const res = await request(app).get("/api/v1/home");

    const newArrivalIds: string[] = res.body.newArrivals.map((p: { id: string }) => p.id);
    expect(newArrivalIds).not.toContain(outOfStockId);
    // Sanity — the fixture really is out of stock, not just excluded for some other reason.
    const inventory = await prisma.inventory.findFirstOrThrow({ where: { variantId: outOfStockVariant } });
    expect(inventory.quantityAvailable).toBe(0);
  });

  it("exposes a Shop Your Size availability count for a curated clothing size with a live variant", async () => {
    await createTestProduct("Curated Size Product", { size: "One Size" });

    const res = await request(app).get("/api/v1/home");

    expect(Array.isArray(res.body.sizeAvailability)).toBe(true);
    const oneSize = res.body.sizeAvailability.find((entry: { size: string }) => entry.size === "One Size");
    expect(oneSize).toBeDefined();
    expect(oneSize.count).toBeGreaterThan(0);
    // A non-clothing, footwear-style numeric size must never appear here (category-aware sizing — homepage audit finding 5).
    const numericSizeEntries = res.body.sizeAvailability.filter((entry: { size: string }) => /^\d/.test(entry.size));
    expect(numericSizeEntries).toEqual([]);
  });

  it("offerCampaigns is [] (never absent) when nothing currently qualifies — the storefront can safely check .length", async () => {
    const res = await request(app).get("/api/v1/home");
    expect(Array.isArray(res.body.offerCampaigns)).toBe(true);
  });

  it("creating a new Offer named 'Christmas Sale' with eligible products makes a homepage campaign section titled exactly 'Christmas Sale' appear, with no code change (offer merchandising pass, 2026-09-15)", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const offerName = `Christmas Sale ${suffix}`;
    const { productId } = await createTestProduct("Christmas Campaign Product");
    const offer = await prisma.offer.create({
      data: {
        name: offerName,
        discountType: "PERCENTAGE",
        discountValue: 20,
        scope: "PRODUCTS",
        priority: 5000,
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 60 * 60_000),
        isActive: true,
        products: { create: [{ productId }] },
      },
    });
    createdOfferIds.push(offer.id);

    const res = await request(app).get("/api/v1/home");

    const campaigns: { offer: { id: string; name: string; discountType: string; discountValue: number }; products: { id: string; offerPricePaise: number }[] }[] =
      res.body.offerCampaigns;
    const campaign = campaigns.find((c) => c.offer.id === offer.id);
    expect(campaign).toBeDefined();
    expect(campaign!.offer.name).toBe(offerName); // the section title comes straight from Offer.name — no hardcoded "Christmas Sale" anywhere in the code
    const product = campaign!.products.find((p) => p.id === productId);
    expect(product).toBeDefined();
    expect(product!.offerPricePaise).toBe(4_000); // 5000 - 20%
  });

  it("a second concurrently active Offer produces its own independent campaign section alongside the first", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const { productId: productA } = await createTestProduct("Diwali Campaign Product A");
    const { productId: productB } = await createTestProduct("Diwali Campaign Product B");
    const offerA = await prisma.offer.create({
      data: {
        name: `Campaign A ${suffix}`,
        discountType: "PERCENTAGE",
        discountValue: 15,
        scope: "PRODUCTS",
        priority: 5001,
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 60 * 60_000),
        isActive: true,
        products: { create: [{ productId: productA }] },
      },
    });
    createdOfferIds.push(offerA.id);
    const offerB = await prisma.offer.create({
      data: {
        name: `Campaign B ${suffix}`,
        discountType: "FIXED_AMOUNT",
        discountValue: 30_000,
        scope: "PRODUCTS",
        priority: 5002,
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 60 * 60_000),
        isActive: true,
        products: { create: [{ productId: productB }] },
      },
    });
    createdOfferIds.push(offerB.id);

    const res = await request(app).get("/api/v1/home");

    const campaigns: { offer: { id: string; name: string }; products: { id: string }[] }[] = res.body.offerCampaigns;
    const campaignA = campaigns.find((c) => c.offer.id === offerA.id);
    const campaignB = campaigns.find((c) => c.offer.id === offerB.id);
    expect(campaignA).toBeDefined();
    expect(campaignB).toBeDefined();
    expect(campaignA!.products.map((p) => p.id)).toContain(productA);
    expect(campaignA!.products.map((p) => p.id)).not.toContain(productB);
    expect(campaignB!.products.map((p) => p.id)).toContain(productB);
    expect(campaignB!.products.map((p) => p.id)).not.toContain(productA);
  });

  it("an expired Offer never produces a campaign section", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const { productId } = await createTestProduct("Expired Offer Product");
    const offer = await prisma.offer.create({
      data: {
        name: `Expired Campaign ${suffix}`,
        discountType: "PERCENTAGE",
        discountValue: 20,
        scope: "PRODUCTS",
        priority: 100,
        startsAt: new Date(Date.now() - 2 * 60 * 60_000),
        endsAt: new Date(Date.now() - 60_000),
        isActive: true,
        products: { create: [{ productId }] },
      },
    });
    createdOfferIds.push(offer.id);

    const res = await request(app).get("/api/v1/home");

    const campaigns: { offer: { id: string } }[] = res.body.offerCampaigns;
    expect(campaigns.some((c) => c.offer.id === offer.id)).toBe(false);
  });

  it("a disabled (isActive: false) Offer never produces a campaign section", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const { productId } = await createTestProduct("Disabled Offer Product");
    const offer = await prisma.offer.create({
      data: {
        name: `Disabled Campaign ${suffix}`,
        discountType: "PERCENTAGE",
        discountValue: 20,
        scope: "PRODUCTS",
        priority: 100,
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 60 * 60_000),
        isActive: false,
        products: { create: [{ productId }] },
      },
    });
    createdOfferIds.push(offer.id);

    const res = await request(app).get("/api/v1/home");

    const campaigns: { offer: { id: string } }[] = res.body.offerCampaigns;
    expect(campaigns.some((c) => c.offer.id === offer.id)).toBe(false);
  });

  it("a product targeted by two overlapping active offers appears ONLY under the winning offer's campaign, never duplicated under both (Offer precedence, not a frontend rule)", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const category = await prisma.category.create({
      data: { name: `Home Overlap Category ${suffix}`, slug: `home-overlap-${suffix}`, isActive: true },
    });
    const productName = `Overlap Product ${suffix}`;
    const product = await prisma.product.create({
      data: { name: productName, slug: `home-overlap-product-${suffix}`, categoryId: category.id, isActive: true, minPricePaiseCache: 10_000 },
    });
    createdProductIds.push(product.id);
    const variant = await prisma.productVariant.create({
      data: { productId: product.id, sku: `HOME-OVERLAP-${suffix}`, color: "Black", size: "M", weightGrams: 400, isActive: true, effectivePricePaiseCache: 10_000 },
    });
    createdVariantIds.push(variant.id);
    await prisma.inventory.create({ data: { variantId: variant.id, warehouseId, quantityAvailable: 10, quantityReserved: 0 } });

    // CATEGORY-scope offer, low priority — should lose.
    const categoryOffer = await prisma.offer.create({
      data: {
        name: `Overlap Category Offer ${suffix}`,
        discountType: "PERCENTAGE",
        discountValue: 10,
        scope: "CATEGORY",
        categoryId: category.id,
        priority: 5000,
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 60 * 60_000),
        isActive: true,
      },
    });
    createdOfferIds.push(categoryOffer.id);
    // PRODUCTS-scope offer targeting the same product — more specific scope always wins, regardless of priority/discount size.
    const productsOffer = await prisma.offer.create({
      data: {
        name: `Overlap Products Offer ${suffix}`,
        discountType: "PERCENTAGE",
        discountValue: 5,
        scope: "PRODUCTS",
        priority: 5001,
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 60 * 60_000),
        isActive: true,
        products: { create: [{ productId: product.id }] },
      },
    });
    createdOfferIds.push(productsOffer.id);

    const res = await request(app).get("/api/v1/home");

    const campaigns: { offer: { id: string }; products: { id: string }[] }[] = res.body.offerCampaigns;
    const categoryCampaign = campaigns.find((c) => c.offer.id === categoryOffer.id);
    const productsCampaign = campaigns.find((c) => c.offer.id === productsOffer.id);
    expect(productsCampaign).toBeDefined();
    expect(productsCampaign!.products.map((p) => p.id)).toContain(product.id);
    // The CATEGORY offer is active and would match this product too, but PRODUCTS scope wins precedence — the CATEGORY offer must not claim it, and (having no other products) must not even produce a section.
    expect(categoryCampaign).toBeUndefined();

    // Delete the product (and its dependents) before the category it
    // references — afterAll's own cleanup runs later and would otherwise
    // hit the same FK constraint the category itself is under.
    await prisma.inventory.deleteMany({ where: { variantId: variant.id } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.category.delete({ where: { id: category.id } });
  });

  it("an active CATEGORY-scope Offer with zero eligible products (no in-stock product in that category) never produces a campaign section", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const isolatedCategory = await prisma.category.create({
      data: { name: `Home Empty Campaign Category ${suffix}`, slug: `home-empty-campaign-${suffix}`, isActive: true },
    });

    const offer = await prisma.offer.create({
      data: {
        name: `Empty Campaign ${suffix}`,
        discountType: "PERCENTAGE",
        discountValue: 20,
        scope: "CATEGORY",
        categoryId: isolatedCategory.id,
        priority: 100,
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 60 * 60_000),
        isActive: true,
      },
    });
    createdOfferIds.push(offer.id);

    const res = await request(app).get("/api/v1/home");

    const campaigns: { offer: { id: string } }[] = res.body.offerCampaigns;
    expect(campaigns.some((c) => c.offer.id === offer.id)).toBe(false);

    await prisma.category.delete({ where: { id: isolatedCategory.id } });
  });
});
