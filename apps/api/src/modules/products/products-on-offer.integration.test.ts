import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

/**
 * Storefront offer-discovery pass (2026-09-15) — integration coverage for
 * the `onOffer` filter and offer-aware `price_asc`/`price_desc` sort added
 * to `GET /api/v1/products` (ProductRepository.findMany's raw-SQL
 * rewrite). Runs against the REAL test database, same convention as this
 * module's sibling `products.integration.test.ts`.
 *
 * Deliberately never creates an ALL_PRODUCTS-scope offer: even with
 * `fileParallelism: false` (vitest.config.ts), a storewide offer would
 * still perturb every OTHER `it` in the SAME describe tree if Vitest ever
 * interleaves them, and every other test file's seeded/demo product prices
 * once files run in sequence with a shared, un-truncated `woobe_test` DB.
 * CATEGORY and PRODUCTS scope alone already exercise every non-trivial
 * branch of the SQL's offer-resolution fragment (the EXISTS subquery,
 * categoryId match, precedence, priority, discount-size, id tie-break);
 * ALL_PRODUCTS's own (trivial, one-line) branch is covered at the domain
 * level by `resolve-applicable-offer.test.ts`.
 */

const app = createApp();
const SUFFIX = crypto.randomUUID().slice(0, 8);
const CATEGORY_SLUG = `on-offer-cat-${SUFFIX}`;
const OTHER_CATEGORY_SLUG = `on-offer-other-cat-${SUFFIX}`;
// Its own category, isolated from CATEGORY_SLUG — a CATEGORY-scope offer
// applies to every product in its category, so the precedence fixture
// (which needs one) must not share a category with the plain no-offer /
// expired / future / inactive fixtures above, or it would put ALL of them
// "on offer" too.
const PRECEDENCE_CATEGORY_SLUG = `on-offer-precedence-cat-${SUFFIX}`;

let categoryId: string;
let otherCategoryId: string;
let precedenceCategoryId: string;
let warehouseId: string;
const createdProductIds: string[] = [];
const createdOfferIds: string[] = [];
const productIdBySlug: Record<string, string> = {};

const NAME_PREFIX = `OnOfferFixture${SUFFIX}`;

async function createProduct(params: { slug: string; name: string; basePricePaise: number; categoryId: string }) {
  const product = await prisma.product.create({
    data: {
      name: params.name,
      slug: params.slug,
      categoryId: params.categoryId,
      isActive: true,
      minPricePaiseCache: params.basePricePaise,
    },
  });
  createdProductIds.push(product.id);
  productIdBySlug[params.slug] = product.id;
  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      sku: `${params.slug}-SKU`.toUpperCase(),
      color: "Black",
      size: "One Size",
      weightGrams: 300,
      isActive: true,
      effectivePricePaiseCache: params.basePricePaise,
    },
  });
  await prisma.inventory.create({
    data: { variantId: variant.id, warehouseId, quantityAvailable: 10, quantityReserved: 0 },
  });
  return product.id;
}

async function createOffer(params: {
  name: string;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
  scope: "CATEGORY" | "PRODUCTS";
  categoryId?: string;
  productIds?: string[];
  priority?: number;
  isActive?: boolean;
  startsAt?: Date;
  endsAt?: Date;
}) {
  const now = Date.now();
  const offer = await prisma.offer.create({
    data: {
      name: params.name,
      discountType: params.discountType,
      discountValue: params.discountValue,
      scope: params.scope,
      categoryId: params.scope === "CATEGORY" ? params.categoryId : null,
      priority: params.priority ?? 0,
      isActive: params.isActive ?? true,
      startsAt: params.startsAt ?? new Date(now - 60_000),
      endsAt: params.endsAt ?? new Date(now + 60 * 60_000),
      ...(params.scope === "PRODUCTS" && params.productIds
        ? { products: { create: params.productIds.map((productId) => ({ productId })) } }
        : {}),
    },
  });
  createdOfferIds.push(offer.id);
  return offer.id;
}

beforeAll(async () => {
  const category = await prisma.category.create({
    data: { name: `On Offer Test ${SUFFIX}`, slug: CATEGORY_SLUG, isActive: true },
  });
  categoryId = category.id;
  const otherCategory = await prisma.category.create({
    data: { name: `On Offer Other Test ${SUFFIX}`, slug: OTHER_CATEGORY_SLUG, isActive: true },
  });
  otherCategoryId = otherCategory.id;
  const precedenceCategory = await prisma.category.create({
    data: { name: `On Offer Precedence Test ${SUFFIX}`, slug: PRECEDENCE_CATEGORY_SLUG, isActive: true },
  });
  precedenceCategoryId = precedenceCategory.id;
  const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { isActive: true } });
  warehouseId = warehouse.id;

  // ── Basic onOffer filter fixtures ──
  await createProduct({ slug: `no-offer-${SUFFIX}`, name: `${NAME_PREFIX} No Offer`, basePricePaise: 10_000, categoryId });
  const percentOfferId = await createProduct({
    slug: `percent-offer-${SUFFIX}`,
    name: `${NAME_PREFIX} Percent Offer`,
    basePricePaise: 20_000,
    categoryId,
  });
  const fixedOfferId = await createProduct({
    slug: `fixed-offer-${SUFFIX}`,
    name: `${NAME_PREFIX} Fixed Offer`,
    basePricePaise: 5_000,
    categoryId,
  });
  const expiredOfferId = await createProduct({
    slug: `expired-offer-${SUFFIX}`,
    name: `${NAME_PREFIX} Expired Offer`,
    basePricePaise: 3_000,
    categoryId,
  });
  const futureOfferId = await createProduct({
    slug: `future-offer-${SUFFIX}`,
    name: `${NAME_PREFIX} Future Offer`,
    basePricePaise: 7_000,
    categoryId,
  });
  const inactiveOfferId = await createProduct({
    slug: `inactive-offer-${SUFFIX}`,
    name: `${NAME_PREFIX} Inactive Offer`,
    basePricePaise: 8_000,
    categoryId,
  });

  await createOffer({ name: "20% off", discountType: "PERCENTAGE", discountValue: 20, scope: "PRODUCTS", productIds: [percentOfferId] });
  await createOffer({ name: "500 paise off", discountType: "FIXED_AMOUNT", discountValue: 500, scope: "PRODUCTS", productIds: [fixedOfferId] });
  await createOffer({
    name: "expired",
    discountType: "PERCENTAGE",
    discountValue: 50,
    scope: "PRODUCTS",
    productIds: [expiredOfferId],
    startsAt: new Date(Date.now() - 60 * 60_000),
    endsAt: new Date(Date.now() - 1000),
  });
  await createOffer({
    name: "future",
    discountType: "PERCENTAGE",
    discountValue: 50,
    scope: "PRODUCTS",
    productIds: [futureOfferId],
    startsAt: new Date(Date.now() + 60_000),
    endsAt: new Date(Date.now() + 60 * 60_000),
  });
  await createOffer({
    name: "inactive",
    discountType: "PERCENTAGE",
    discountValue: 50,
    scope: "PRODUCTS",
    productIds: [inactiveOfferId],
    isActive: false,
  });

  // ── Sort-flip fixtures: base-price order would put X before Y; the
  // offer-adjusted EFFECTIVE price order must put Y before X instead. ──
  await createProduct({
    slug: `sort-x-${SUFFIX}`,
    name: `${NAME_PREFIX} Sort X (no offer, base 8000)`,
    basePricePaise: 8_000,
    categoryId,
  });
  const sortLowBigOfferId = await createProduct({
    slug: `sort-y-${SUFFIX}`,
    name: `${NAME_PREFIX} Sort Y (50% off, base 9000 -> 4500)`,
    basePricePaise: 9_000,
    categoryId,
  });
  await createOffer({ name: "sort-flip 50% off", discountType: "PERCENTAGE", discountValue: 50, scope: "PRODUCTS", productIds: [sortLowBigOfferId] });

  // ── Precedence fixtures (own isolated category — see PRECEDENCE_CATEGORY_SLUG's own comment) ──
  // PRODUCTS-scope (5% off) must beat this product's own CATEGORY-scope
  // offer (10% off) despite the smaller discount — scope specificity wins
  // before discount size is ever compared.
  const precedenceProductId = await createProduct({
    slug: `precedence-${SUFFIX}`,
    name: `${NAME_PREFIX} Precedence`,
    basePricePaise: 10_000,
    categoryId: precedenceCategoryId,
  });
  await createOffer({ name: "category 10% off", discountType: "PERCENTAGE", discountValue: 10, scope: "CATEGORY", categoryId: precedenceCategoryId });
  await createOffer({ name: "products 5% off (should win)", discountType: "PERCENTAGE", discountValue: 5, scope: "PRODUCTS", productIds: [precedenceProductId] });

  // Priority tie-break: two PRODUCTS-scope offers on the same product,
  // same specificity — higher `priority` wins even with a smaller discount.
  const priorityProductId = await createProduct({
    slug: `priority-${SUFFIX}`,
    name: `${NAME_PREFIX} Priority`,
    basePricePaise: 10_000,
    categoryId,
  });
  await createOffer({ name: "priority low, 20% off", discountType: "PERCENTAGE", discountValue: 20, scope: "PRODUCTS", productIds: [priorityProductId], priority: 1 });
  await createOffer({ name: "priority high, 5% off (should win)", discountType: "PERCENTAGE", discountValue: 5, scope: "PRODUCTS", productIds: [priorityProductId], priority: 5 });

  // Discount-size tie-break: same scope, same priority — the larger
  // discount wins.
  const discountSizeProductId = await createProduct({
    slug: `discount-size-${SUFFIX}`,
    name: `${NAME_PREFIX} Discount Size`,
    basePricePaise: 10_000,
    categoryId,
  });
  await createOffer({ name: "smaller (20% = 2000)", discountType: "PERCENTAGE", discountValue: 20, scope: "PRODUCTS", productIds: [discountSizeProductId] });
  await createOffer({ name: "bigger (fixed 3000, should win)", discountType: "FIXED_AMOUNT", discountValue: 3000, scope: "PRODUCTS", productIds: [discountSizeProductId] });

  // A product in a DIFFERENT category, never targeted by anything — proves
  // the CATEGORY-scope offer above doesn't leak across categories.
  await createProduct({ slug: `other-category-${SUFFIX}`, name: `${NAME_PREFIX} Other Category`, basePricePaise: 10_000, categoryId: otherCategoryId });
});

afterAll(async () => {
  await prisma.offer.deleteMany({ where: { id: { in: createdOfferIds } } });
  await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
  await prisma.category.delete({ where: { id: categoryId } });
  await prisma.category.delete({ where: { id: otherCategoryId } });
  await prisma.category.delete({ where: { id: precedenceCategoryId } });
  await prisma.$disconnect();
});

function slugsOf(body: { products: { slug: string }[] }): string[] {
  return body.products.map((p) => p.slug);
}

describe("GET /api/v1/products?onOffer=true — filter", () => {
  it("returns only products with a currently-applicable automatic offer", async () => {
    const res = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, onOffer: "true", limit: 50 });
    expect(res.status).toBe(200);
    const slugs = slugsOf(res.body);
    expect(slugs).toContain(`percent-offer-${SUFFIX}`);
    expect(slugs).toContain(`fixed-offer-${SUFFIX}`);
    expect(slugs).not.toContain(`no-offer-${SUFFIX}`);
  });

  it("excludes an offer that has already ended", async () => {
    const res = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, onOffer: "true", limit: 50 });
    expect(slugsOf(res.body)).not.toContain(`expired-offer-${SUFFIX}`);
  });

  it("excludes an offer that hasn't started yet", async () => {
    const res = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, onOffer: "true", limit: 50 });
    expect(slugsOf(res.body)).not.toContain(`future-offer-${SUFFIX}`);
  });

  it("excludes an offer that's been deactivated", async () => {
    const res = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, onOffer: "true", limit: 50 });
    expect(slugsOf(res.body)).not.toContain(`inactive-offer-${SUFFIX}`);
  });

  it("combines with the category filter (server-side, not client-side post-filtering)", async () => {
    const res = await request(app).get("/api/v1/products").query({ category: OTHER_CATEGORY_SLUG, onOffer: "true", limit: 50 });
    expect(res.status).toBe(200);
    expect(res.body.products).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it("reports an accurate total count for the onOffer-filtered set", async () => {
    const res = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, onOffer: "true", limit: 1 });
    expect(res.status).toBe(200);
    expect(res.body.products.length).toBe(1);
    // Same fixture set queried unpaginated, for the true total.
    const full = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, onOffer: "true", limit: 50 });
    expect(res.body.total).toBe(full.body.total);
    expect(res.body.total).toBeGreaterThanOrEqual(5); // percent, fixed, sort-y, priority, discount-size
  });

  it("omitted (no onOffer param) returns both offered and non-offered products", async () => {
    const res = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, limit: 50 });
    const slugs = slugsOf(res.body);
    expect(slugs).toContain(`no-offer-${SUFFIX}`);
    expect(slugs).toContain(`percent-offer-${SUFFIX}`);
  });
});

describe("GET /api/v1/products?sort=price_asc|price_desc — offer-aware effective price", () => {
  it("computes offerPricePaise as base minus the winning offer's discount (percentage, floored)", async () => {
    const res = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, onOffer: "true", limit: 50 });
    const percent = res.body.products.find((p: { slug: string }) => p.slug === `percent-offer-${SUFFIX}`);
    expect(percent.offerPricePaise).toBe(16_000); // 20000 - 20%
    const fixed = res.body.products.find((p: { slug: string }) => p.slug === `fixed-offer-${SUFFIX}`);
    expect(fixed.offerPricePaise).toBe(4_500); // 5000 - 500
  });

  it("sorts price_asc by EFFECTIVE price, flipping the base-price order when a discount is large enough", async () => {
    const res = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, sort: "price_asc", limit: 50 });
    const slugs = slugsOf(res.body);
    const xIndex = slugs.indexOf(`sort-x-${SUFFIX}`); // base 8000, no offer -> effective 8000
    const yIndex = slugs.indexOf(`sort-y-${SUFFIX}`); // base 9000, 50% off -> effective 4500
    expect(xIndex).toBeGreaterThan(-1);
    expect(yIndex).toBeGreaterThan(-1);
    // Base-price order would put X (8000) before Y (9000); effective-price
    // order must put Y (4500) before X (8000) instead.
    expect(yIndex).toBeLessThan(xIndex);
  });

  it("sorts price_desc by EFFECTIVE price too (not the raw base price)", async () => {
    const res = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, sort: "price_desc", limit: 50 });
    const slugs = slugsOf(res.body);
    const xIndex = slugs.indexOf(`sort-x-${SUFFIX}`);
    const yIndex = slugs.indexOf(`sort-y-${SUFFIX}`);
    // Descending effective price: X (8000) now comes before Y (4500).
    expect(xIndex).toBeLessThan(yIndex);
  });

  it("keeps price_asc ordering stable and correct across a pagination boundary (sort happens before LIMIT/OFFSET, not after)", async () => {
    const full = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, sort: "price_asc", limit: 50 });
    const fullSlugs = slugsOf(full.body);

    const page1 = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, sort: "price_asc", page: 1, limit: 4 });
    const page2 = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, sort: "price_asc", page: 2, limit: 4 });

    expect(slugsOf(page1.body)).toEqual(fullSlugs.slice(0, 4));
    expect(slugsOf(page2.body)).toEqual(fullSlugs.slice(4, 8));
    expect(page1.body.total).toBe(full.body.total);
    expect(page2.body.total).toBe(full.body.total);
  });
});

describe("GET /api/v1/products — offer precedence (SQL sort/filter agrees with the domain resolver)", () => {
  it("PRODUCTS scope beats CATEGORY scope even with a smaller discount", async () => {
    const res = await request(app).get("/api/v1/products").query({ category: PRECEDENCE_CATEGORY_SLUG, limit: 50 });
    const product = res.body.products.find((p: { slug: string }) => p.slug === `precedence-${SUFFIX}`);
    expect(product.offer.name).toBe("products 5% off (should win)");
    expect(product.offerPricePaise).toBe(9_500); // 10000 - 5%, not 10000 - 10%
  });

  it("higher priority wins within the same scope, even with a smaller discount", async () => {
    const res = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, limit: 50 });
    const product = res.body.products.find((p: { slug: string }) => p.slug === `priority-${SUFFIX}`);
    expect(product.offer.name).toBe("priority high, 5% off (should win)");
    expect(product.offerPricePaise).toBe(9_500);
  });

  it("the larger discount wins when scope and priority are tied", async () => {
    const res = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, limit: 50 });
    const product = res.body.products.find((p: { slug: string }) => p.slug === `discount-size-${SUFFIX}`);
    expect(product.offer.name).toBe("bigger (fixed 3000, should win)");
    expect(product.offerPricePaise).toBe(7_000); // 10000 - 3000, not 10000 - 2000
  });
});
