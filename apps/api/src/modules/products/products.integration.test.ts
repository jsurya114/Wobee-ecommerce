import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

/**
 * Integration tests against the REAL test database (mirrors cart's/orders'
 * own *.integration.test.ts files) — Week 2 Day 1 catalogue discovery
 * (week2 (1).md §3's own test list: search, filters, combined filters,
 * sorting, pagination, empty results, invalid parameters).
 *
 * Everything lives inside its own category/collection (never reused from
 * seed data) so assertions can rely on exact counts/order without being
 * disturbed by the 10 seeded demo products or any other test file's
 * fixtures running in parallel. Product names all carry a per-run random
 * token so `q` search assertions can't accidentally match seed data either.
 */

const app = createApp();
const SUFFIX = crypto.randomUUID().slice(0, 8);
const CATEGORY_SLUG = `catalog-search-cat-${SUFFIX}`;
const COLLECTION_SLUG = `catalog-search-col-${SUFFIX}`;
const SEARCH_TOKEN = `Zephyrq${SUFFIX}`;

let categoryId: string;
let collectionId: string;
let warehouseId: string;
const createdProductIds: string[] = [];

// price_asc order (default sort): plainScarf < auroraJacket < auroraCoat < breezeSkirt. Breeze Top
// (15000, between jacket and coat) has zero stock, so no listing ever includes it (2026-09-30).
const PRICE_ASC_NAMES = ["plain-scarf", "aurora-jacket", "aurora-coat", "breeze-skirt"];
const SOLD_OUT_NAME = `Zephyrq${SUFFIX} Breeze Top`;

const productIdBySlug: Record<string, string> = {};

beforeAll(async () => {
  const category = await prisma.category.create({
    data: { name: `Catalog Search Test ${SUFFIX}`, slug: CATEGORY_SLUG, isActive: true },
  });
  categoryId = category.id;
  const collection = await prisma.collection.create({
    data: { name: `Catalog Search Collection ${SUFFIX}`, slug: COLLECTION_SLUG, isActive: true },
  });
  collectionId = collection.id;
  const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { isActive: true } });
  warehouseId = warehouse.id;

  const base = Date.now();
  type FixtureVariant = { color: string; size: string; weightGrams: number; stock: number };
  type Fixture = {
    slug: string;
    name: string;
    createdAt: Date;
    minPricePaise: number;
    inCollection: boolean;
    variants: FixtureVariant[];
  };
  const fixtures: Fixture[] = [
    {
      slug: `aurora-jacket-${SUFFIX}`,
      name: `${SEARCH_TOKEN} Aurora Jacket`,
      createdAt: new Date(base - 5000),
      minPricePaise: 10_000,
      inCollection: true,
      // Two variants, deliberately NOT sharing both size and color on one
      // row (Red+L, Black+M) — this is what lets the "independent facets"
      // test prove size=M&color=Red matches via two different variants of
      // the same product, not a single variant that happens to be both.
      variants: [
        { color: "Red", size: "L", weightGrams: 500, stock: 10 },
        { color: "Black", size: "M", weightGrams: 520, stock: 6 },
      ],
    },
    {
      slug: `aurora-coat-${SUFFIX}`,
      name: `${SEARCH_TOKEN} Aurora Coat`,
      createdAt: new Date(base - 4000),
      minPricePaise: 20_000,
      inCollection: false,
      variants: [{ color: "Blue", size: "L", weightGrams: 800, stock: 5 }],
    },
    {
      slug: `breeze-top-${SUFFIX}`,
      name: `${SEARCH_TOKEN} Breeze Top`,
      createdAt: new Date(base - 3000),
      minPricePaise: 15_000,
      inCollection: false,
      variants: [{ color: "Red", size: "S", weightGrams: 200, stock: 0 }], // out of stock
    },
    {
      slug: `breeze-skirt-${SUFFIX}`,
      name: `${SEARCH_TOKEN} Breeze Skirt`,
      createdAt: new Date(base - 2000),
      minPricePaise: 30_000,
      inCollection: true,
      variants: [{ color: "Green", size: "M", weightGrams: 400, stock: 8 }],
    },
    {
      slug: `plain-scarf-${SUFFIX}`,
      name: `Plain Scarf ${SUFFIX}`, // deliberately NOT carrying SEARCH_TOKEN
      createdAt: new Date(base - 1000),
      minPricePaise: 5_000,
      inCollection: false,
      variants: [{ color: "White", size: "One Size", weightGrams: 100, stock: 3 }],
    },
  ];

  for (const fixture of fixtures) {
    const product = await prisma.product.create({
      data: {
        name: fixture.name,
        slug: fixture.slug,
        categoryId,
        isActive: true,
        minPricePaiseCache: fixture.minPricePaise,
        createdAt: fixture.createdAt,
        ...(fixture.inCollection ? { collections: { create: { collectionId } } } : {}),
      },
    });
    createdProductIds.push(product.id);
    productIdBySlug[fixture.slug] = product.id;

    for (const variant of fixture.variants) {
      const created = await prisma.productVariant.create({
        data: {
          productId: product.id,
          sku: `${fixture.slug}-${variant.color}-${variant.size}`.toUpperCase().replace(/\s+/g, "-"),
          color: variant.color,
          size: variant.size,
          weightGrams: variant.weightGrams,
          isActive: true,
          effectivePricePaiseCache: fixture.minPricePaise,
        },
      });
      await prisma.inventory.create({
        data: { variantId: created.id, warehouseId, quantityAvailable: variant.stock, quantityReserved: 0 },
      });
    }
  }
});

afterAll(async () => {
  // Cascades (schema.prisma: ProductVariant/ProductImage/ProductCollection
  // all onDelete: Cascade off Product, Inventory onDelete: Cascade off
  // ProductVariant) take variants/inventory/collection-links with it.
  await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
  await prisma.collection.delete({ where: { id: collectionId } });
  await prisma.category.delete({ where: { id: categoryId } });
  await prisma.$disconnect();
});

function namesOf(body: { products: { name: string }[] }): string[] {
  return body.products.map((p) => p.name);
}

describe("GET /api/v1/categories (Week 1 behavior — verified still correct)", () => {
  it("lists active categories, including this suite's own fixture category", async () => {
    const res = await request(app).get("/api/v1/categories");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.categories)).toBe(true);
    expect(res.body.categories.length).toBeGreaterThanOrEqual(5); // at least the 5 seeded categories
    expect(res.body.categories.some((c: { slug: string }) => c.slug === CATEGORY_SLUG)).toBe(true);
  });
});

describe("GET /api/v1/collections (Week 2 Day 1 — new, listing only)", () => {
  it("lists active collections with name/slug/description", async () => {
    const res = await request(app).get("/api/v1/collections");
    expect(res.status).toBe(200);
    const fixture = res.body.collections.find((c: { slug: string }) => c.slug === COLLECTION_SLUG);
    expect(fixture).toMatchObject({
      name: `Catalog Search Collection ${SUFFIX}`,
      slug: COLLECTION_SLUG,
      description: null,
    });
  });
});

describe("GET /api/v1/products — search", () => {
  it("matches by partial, case-insensitive product name (pg_trgm-backed ILIKE)", async () => {
    const res = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, q: SEARCH_TOKEN.toLowerCase() });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3); // every fixture except plain-scarf carries the token; sold-out breeze-top is never listed
    expect(namesOf(res.body).every((n) => n.includes(SEARCH_TOKEN))).toBe(true);
    expect(namesOf(res.body)).not.toContain(SOLD_OUT_NAME);
  });

  it("matches a substring in the middle of the name, not just a prefix", async () => {
    const res = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, q: "urora" });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(namesOf(res.body).sort()).toEqual([`${SEARCH_TOKEN} Aurora Coat`, `${SEARCH_TOKEN} Aurora Jacket`].sort());
  });

  it("returns an empty page, not an error, for a term that matches nothing", async () => {
    const res = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, q: "nonexistentxyz123" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ products: [], total: 0 });
  });
});

describe("GET /api/v1/products/suggestions — search typeahead", () => {
  it("returns lean matching rows, capped, for a real query", async () => {
    const res = await request(app).get("/api/v1/products/suggestions").query({ q: SEARCH_TOKEN.toLowerCase() });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.suggestions)).toBe(true);
    expect(res.body.suggestions.length).toBeGreaterThan(0);
    expect(res.body.suggestions.length).toBeLessThanOrEqual(6);
    const first = res.body.suggestions[0];
    expect(Object.keys(first).sort()).toEqual(["id", "minPricePaiseCache", "name", "primaryImage", "slug"]);
    expect(first).not.toHaveProperty("variants");
    expect(first.name.toLowerCase()).toContain(SEARCH_TOKEN.toLowerCase());
  });

  it("returns an empty list (not a 400) for a query under 2 characters", async () => {
    for (const q of ["", "a", "  "]) {
      const res = await request(app).get("/api/v1/products/suggestions").query({ q });
      expect(res.status).toBe(200);
      expect(res.body.suggestions).toEqual([]);
    }
  });

  it("returns an empty list for a term that matches nothing", async () => {
    const res = await request(app).get("/api/v1/products/suggestions").query({ q: "nomatchxyz987" });
    expect(res.status).toBe(200);
    expect(res.body.suggestions).toEqual([]);
  });

  it("smart search: ranks the product matching every word and the colour first", async () => {
    const res = await request(app)
      .get("/api/v1/products/suggestions")
      .query({ q: `${SEARCH_TOKEN} red color jacket` });
    expect(res.status).toBe(200);
    expect(res.body.suggestions[0].name).toBe(`${SEARCH_TOKEN} Aurora Jacket`);
  });

  it("smart search: treats % and _ as literal characters, not wildcards", async () => {
    const res = await request(app).get("/api/v1/products/suggestions").query({ q: "%%" });
    expect(res.status).toBe(200);
    expect(res.body.suggestions).toEqual([]);
  });

  it("does not shadow GET /api/v1/products/:slug", async () => {
    const slug = `aurora-jacket-${SUFFIX}`;
    const res = await request(app).get(`/api/v1/products/${slug}`);
    expect(res.status).toBe(200);
    expect(res.body.product.slug).toBe(slug);
  });
});

describe("GET /api/v1/products/:slug/related — related products (PDP, same category only)", () => {
  const currentSlug = `aurora-jacket-${SUFFIX}`;
  // The 4 other ACTIVE products that share the test category with aurora-jacket.
  const sameCategoryActiveNames = [
    `${SEARCH_TOKEN} Aurora Coat`,
    `${SEARCH_TOKEN} Breeze Top`,
    `${SEARCH_TOKEN} Breeze Skirt`,
    `Plain Scarf ${SUFFIX}`,
  ];
  let inactiveInCategoryName: string;
  let loneCategoryId: string;
  let loneProductSlug: string;

  beforeAll(async () => {
    inactiveInCategoryName = `${SEARCH_TOKEN} Hidden Draft`;
    const hidden = await prisma.product.create({
      data: {
        name: inactiveInCategoryName,
        slug: `hidden-draft-${SUFFIX}`,
        categoryId,
        isActive: false,
        minPricePaiseCache: 12_000,
      },
    });
    createdProductIds.push(hidden.id); // module afterAll cleans this up

    // A category with exactly one product — the "no other products in this
    // category" case must return [] rather than borrowing from elsewhere.
    const loneCategory = await prisma.category.create({
      data: { name: `Lone Cat ${SUFFIX}`, slug: `lone-cat-${SUFFIX}`, isActive: true },
    });
    loneCategoryId = loneCategory.id;
    loneProductSlug = `lone-product-${SUFFIX}`;
    await prisma.product.create({
      data: { name: `Lone Product ${SUFFIX}`, slug: loneProductSlug, categoryId: loneCategoryId, isActive: true, minPricePaiseCache: 9_000 },
    });
  });

  afterAll(async () => {
    // Cleaned up here (not via the module afterAll) so the product goes
    // before its category — this describe's afterAll runs before the
    // module-level one.
    await prisma.product.delete({ where: { slug: loneProductSlug } });
    await prisma.category.delete({ where: { id: loneCategoryId } });
  });

  it("returns ONLY products from the current product's own category, never the product itself or an inactive one", async () => {
    const res = await request(app).get(`/api/v1/products/${currentSlug}/related`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.products)).toBe(true);

    const names: string[] = namesOf(res.body);
    const slugs: string[] = res.body.products.map((p: { slug: string }) => p.slug);

    // exactly the 4 active siblings — no more (no cross-category fallback), no self, no inactive
    expect(res.body.products.length).toBe(4);
    expect(res.body.products.length).toBeLessThanOrEqual(8);
    expect((res.body.products as { categoryId: string }[]).every((p) => p.categoryId === categoryId)).toBe(true);
    expect(slugs).not.toContain(currentSlug);
    expect(names).not.toContain(inactiveInCategoryName);
    for (const name of sameCategoryActiveNames) {
      expect(names).toContain(name);
    }
  });

  it("returns [] (no unrelated products) when the category has no other products", async () => {
    const res = await request(app).get(`/api/v1/products/${loneProductSlug}/related`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ products: [] });
  });

  it("returns each product in the same summary shape the listing/card uses", async () => {
    const res = await request(app).get(`/api/v1/products/${currentSlug}/related`);
    const first = res.body.products[0];
    expect(Object.keys(first).sort()).toEqual(
      [
        "brand",
        "categoryId",
        "fromRatePerKgPaise",
        "fromWeightGrams",
        "id",
        "minPricePaiseCache",
        "offer",
        "offerPricePaise",
        "primaryImage",
        "slug",
        "name",
      ].sort(),
    );
    expect(typeof first.minPricePaiseCache).toBe("number");
    expect(first).not.toHaveProperty("representativeVariant");
    expect(first).not.toHaveProperty("variants");
  });

  it("returns 200 with an empty list for an unknown slug (the section just hides itself)", async () => {
    const res = await request(app).get(`/api/v1/products/does-not-exist-${SUFFIX}/related`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ products: [] });
  });
});

describe("GET /api/v1/products — weight/rate on the summary (redesign O-1)", () => {
  it("exposes each product's `from` weight + resolved rate/kg (cheapest active variant)", async () => {
    const res = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG });
    expect(res.status).toBe(200);
    for (const product of res.body.products as { fromWeightGrams: number; fromRatePerKgPaise: number }[]) {
      expect(product.fromWeightGrams).toBeGreaterThan(0);
      // no fixture sets a variant rate override → the seeded admin default rate applies
      expect(product.fromRatePerKgPaise).toBeGreaterThan(0);
    }
    // Plain Scarf's only variant is 100g — the "from" weight must be that variant's
    const scarf = (res.body.products as { name: string; fromWeightGrams: number }[]).find((p) => p.name.includes("Plain Scarf"));
    expect(scarf?.fromWeightGrams).toBe(100);
  });
});

describe("GET /api/v1/products — filters", () => {
  it("filters by category, isolated from other categories' products", async () => {
    const res = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(4); // the 5 fixtures minus sold-out breeze-top
  });

  it("404s for an unknown category slug", async () => {
    const res = await request(app).get("/api/v1/products").query({ category: `unknown-${SUFFIX}` });
    expect(res.status).toBe(404);
  });

  it("filters by collection", async () => {
    const res = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, collection: COLLECTION_SLUG });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(namesOf(res.body).sort()).toEqual(
      [`${SEARCH_TOKEN} Aurora Jacket`, `${SEARCH_TOKEN} Breeze Skirt`].sort(),
    );
  });

  it("404s for an unknown collection slug", async () => {
    const res = await request(app).get("/api/v1/products").query({ collection: `unknown-${SUFFIX}` });
    expect(res.status).toBe(404);
  });

  it("filters by variant size", async () => {
    const res = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, size: "M" });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2); // aurora-jacket (M) + breeze-skirt (M) — coat is L, top is S, scarf is One Size
  });

  it("filters by variant color, with comma-separated multi-value support", async () => {
    const res = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, color: "Red" });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1); // aurora-jacket; breeze-top is Red too but sold out
    expect(namesOf(res.body)).toEqual([`${SEARCH_TOKEN} Aurora Jacket`]);

    const multi = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, color: "Red,Blue" });
    expect(multi.body.total).toBe(2); // + aurora-coat (Blue)
  });

  it("smart search: strict matches first, looser matches below when the strict ones don't fill a page", async () => {
    const res = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, q: "red aurora" });
    expect(res.status).toBe(200);
    // Strict: Aurora Jacket (named aurora, has a Red variant). Then the looser match Aurora Coat (aurora);
    // Breeze Top (red) would sit between them but is sold out.
    expect(namesOf(res.body)).toEqual([`${SEARCH_TOKEN} Aurora Jacket`, `${SEARCH_TOKEN} Aurora Coat`]);
    expect(res.body.total).toBe(2);
    expect(res.body.searchInterpretation).toEqual({ keywords: "aurora", colors: ["red"], sizes: [], fabrics: [], fits: [] });
  });

  it("smart search: lists only strict matches once they fill the page", async () => {
    const res = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, q: "red aurora", limit: 1 });
    expect(namesOf(res.body)).toEqual([`${SEARCH_TOKEN} Aurora Jacket`]);
    expect(res.body.total).toBe(1);
  });

  it("smart search: a size word matches variants, and explicit facets still hard-filter", async () => {
    const bySize = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, q: "large" });
    expect(namesOf(bySize.body).sort()).toEqual([`${SEARCH_TOKEN} Aurora Coat`, `${SEARCH_TOKEN} Aurora Jacket`].sort());

    const withFacet = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, q: "red aurora", color: "Blue" });
    expect(namesOf(withFacet.body)).toEqual([`${SEARCH_TOKEN} Aurora Coat`]);
  });

  it("filters by pricing mode (Fashion by Weight), and 400s an unknown mode", async () => {
    const scarfId = productIdBySlug[`plain-scarf-${SUFFIX}`]!;
    await prisma.product.update({ where: { id: scarfId }, data: { pricingMode: "FIXED" } });
    try {
      const weighed = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, pricingMode: "WEIGHT_BASED" });
      expect(weighed.status).toBe(200);
      expect(weighed.body.total).toBe(3); // sold-out breeze-top excluded
      expect(namesOf(weighed.body)).not.toContain(`Plain Scarf ${SUFFIX}`);

      const fixed = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, pricingMode: "FIXED" });
      expect(fixed.body.total).toBe(1);

      const both = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG });
      expect(both.body.total).toBe(4);

      const bad = await request(app).get("/api/v1/products").query({ pricingMode: "BY_VIBES" });
      expect(bad.status).toBe(400);
    } finally {
      await prisma.product.update({ where: { id: scarfId }, data: { pricingMode: "WEIGHT_BASED" } });
    }
  });

  it("treats size and color as independent facets — matches across two different variants of the same product", async () => {
    // aurora-jacket's variants are Red+L and Black+M — NO single variant is
    // both Red and M. If the filter required one variant to match both
    // facets, aurora-jacket would be excluded; since it's independent
    // ("has an M variant" AND "has a Red variant", not necessarily the same
    // row), it's included. breeze-skirt has an M variant but no Red variant
    // at all, so it's correctly excluded either way.
    const res = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, size: "M", color: "Red" });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(namesOf(res.body)).toEqual([`${SEARCH_TOKEN} Aurora Jacket`]);
  });

  it("filters to in-stock-only, excluding the zero-stock fixture", async () => {
    const res = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, inStock: "true" });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(4);
    expect(namesOf(res.body)).not.toContain(`${SEARCH_TOKEN} Breeze Top`);
  });

  it("in-stock filter reflects LIVE inventory, not a snapshot — flips as stock changes", async () => {
    const outOfStockVariant = await prisma.productVariant.findFirstOrThrow({
      where: { product: { slug: `breeze-top-${SUFFIX}` } },
    });

    // Smart search (2026-09-29) widens "Breeze Top" to the in-stock Breeze Skirt when there is no exact match, so assert on the Top itself.
    const before = await request(app)
      .get("/api/v1/products")
      .query({ category: CATEGORY_SLUG, inStock: "true", q: "Breeze Top" });
    expect(namesOf(before.body)).not.toContain(`${SEARCH_TOKEN} Breeze Top`);

    await prisma.inventory.updateMany({ where: { variantId: outOfStockVariant.id }, data: { quantityAvailable: 4 } });
    try {
      const after = await request(app)
        .get("/api/v1/products")
        .query({ category: CATEGORY_SLUG, inStock: "true", q: "Breeze Top" });
      expect(namesOf(after.body)[0]).toBe(`${SEARCH_TOKEN} Breeze Top`);
    } finally {
      // Restore, so later tests in this file (and re-runs) see the original zero-stock fixture.
      await prisma.inventory.updateMany({ where: { variantId: outOfStockVariant.id }, data: { quantityAvailable: 0 } });
    }
  });

  it("filters by inclusive price range against the display/sort cache", async () => {
    const res = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, minPrice: "15000", maxPrice: "25000" });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1); // aurora-coat (20000); breeze-top (15000) is in range but sold out
    expect(namesOf(res.body)).toEqual([`${SEARCH_TOKEN} Aurora Coat`]);
  });

  it("never lists a sold-out product, with or without inStock — and lists it again once restocked (2026-09-30)", async () => {
    const soldOutVariant = await prisma.productVariant.findFirstOrThrow({ where: { product: { slug: `breeze-top-${SUFFIX}` } } });

    const withoutFlag = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, limit: 50 });
    expect(namesOf(withoutFlag.body)).not.toContain(SOLD_OUT_NAME);
    expect(withoutFlag.body.total).toBe(4);

    // Its PDP is unaffected — still reachable, just not purchasable.
    const pdp = await request(app).get(`/api/v1/products/breeze-top-${SUFFIX}`);
    expect(pdp.status).toBe(200);
    expect(pdp.body.product.variants.every((v: { inStock: boolean }) => !v.inStock)).toBe(true);

    await prisma.inventory.updateMany({ where: { variantId: soldOutVariant.id }, data: { quantityAvailable: 2 } });
    try {
      const restocked = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, limit: 50 });
      expect(namesOf(restocked.body)).toContain(SOLD_OUT_NAME);
      expect(restocked.body.total).toBe(5);

      // Stock fully reserved (e.g. mid-checkout) is not available stock.
      await prisma.inventory.updateMany({ where: { variantId: soldOutVariant.id }, data: { quantityReserved: 2 } });
      const reserved = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, limit: 50 });
      expect(namesOf(reserved.body)).not.toContain(SOLD_OUT_NAME);
    } finally {
      await prisma.inventory.updateMany({ where: { variantId: soldOutVariant.id }, data: { quantityAvailable: 0, quantityReserved: 0 } });
    }

    const soldOutAgain = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, limit: 50 });
    expect(namesOf(soldOutAgain.body)).not.toContain(SOLD_OUT_NAME);
  });

  it("a product stays listed while ANY active variant has stock, and drops out once none do", async () => {
    // aurora-jacket: Red/L (10) + Black/M (6).
    const jacketVariants = await prisma.productVariant.findMany({ where: { product: { slug: `aurora-jacket-${SUFFIX}` } }, orderBy: { size: "asc" } });
    const [large, medium] = jacketVariants; // L, M
    const jacketName = `${SEARCH_TOKEN} Aurora Jacket`;
    try {
      await prisma.inventory.updateMany({ where: { variantId: large!.id }, data: { quantityAvailable: 0 } });
      const oneLeft = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG });
      expect(namesOf(oneLeft.body)).toContain(jacketName);

      // The only variant with stock is deactivated → nothing purchasable → sold out.
      await prisma.productVariant.update({ where: { id: medium!.id }, data: { isActive: false } });
      const inactive = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG });
      expect(namesOf(inactive.body)).not.toContain(jacketName);
    } finally {
      await prisma.productVariant.update({ where: { id: medium!.id }, data: { isActive: true } });
      await prisma.inventory.updateMany({ where: { variantId: large!.id }, data: { quantityAvailable: 10 } });
    }
  });
});

describe("GET /api/v1/products — combined filters", () => {
  it("combines category + color + in-stock (excludes the Red item that's out of stock)", async () => {
    const res = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, color: "Red", inStock: "true" });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(namesOf(res.body)).toEqual([`${SEARCH_TOKEN} Aurora Jacket`]);
  });

  it("combines search + size + in-stock", async () => {
    const res = await request(app)
      .get("/api/v1/products")
      .query({ category: CATEGORY_SLUG, q: SEARCH_TOKEN, size: "M", inStock: "true" });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2); // aurora-jacket + breeze-skirt (plain-scarf excluded by q; nothing excluded by inStock here)
  });
});

describe("GET /api/v1/products — sorting", () => {
  it("sorts by price ascending (default)", async () => {
    const res = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, limit: 10 });
    expect(res.body.products.map((p: { id: string }) => p.id)).toEqual(PRICE_ASC_NAMES.map((slug) => productIdBySlug[`${slug}-${SUFFIX}`]));
  });

  it("sorts by price descending", async () => {
    const res = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, sort: "price_desc", limit: 10 });
    expect(res.body.products.map((p: { id: string }) => p.id)).toEqual(
      [...PRICE_ASC_NAMES].reverse().map((slug) => productIdBySlug[`${slug}-${SUFFIX}`]),
    );
  });

  it("sorts by newest (createdAt descending)", async () => {
    const res = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, sort: "newest", limit: 10 });
    // Fixtures were created oldest→newest as: aurora-jacket, aurora-coat, breeze-top, breeze-skirt, plain-scarf (breeze-top sold out).
    const expectedNewestFirst = ["plain-scarf", "breeze-skirt", "aurora-coat", "aurora-jacket"];
    expect(res.body.products.map((p: { id: string }) => p.id)).toEqual(
      expectedNewestFirst.map((slug) => productIdBySlug[`${slug}-${SUFFIX}`]),
    );
  });
});

describe("GET /api/v1/products — pagination", () => {
  it("paginates with a stable total across pages", async () => {
    const page1 = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, limit: 2, page: 1 });
    const page2 = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, limit: 2, page: 2 });
    const page3 = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, limit: 2, page: 3 });

    // 4 listable fixtures (sold-out breeze-top excluded).
    expect(page1.body.total).toBe(4);
    expect(page2.body.total).toBe(4);
    expect(page3.body.total).toBe(4);
    expect(page1.body.products).toHaveLength(2);
    expect(page2.body.products).toHaveLength(2);
    expect(page3.body.products).toHaveLength(0);

    const allIds = [...page1.body.products, ...page2.body.products].map((p: { id: string }) => p.id);
    expect(new Set(allIds).size).toBe(4); // no duplicate, no skipped row across pages
  });

  it("is stable — repeating the same page returns the identical order", async () => {
    const first = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, limit: 3, page: 1 });
    const second = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, limit: 3, page: 1 });
    expect(second.body.products.map((p: { id: string }) => p.id)).toEqual(first.body.products.map((p: { id: string }) => p.id));
  });

  it("caps limit at 50 by default and returns an empty page past the last one", async () => {
    const res = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, page: 99, limit: 10 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ products: [], total: 4, page: 99, limit: 10 });
  });
});

describe("GET /api/v1/products — invalid parameters", () => {
  it("rejects a limit above the 50 cap", async () => {
    const res = await request(app).get("/api/v1/products").query({ limit: "999" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects limit=0", async () => {
    const res = await request(app).get("/api/v1/products").query({ limit: "0" });
    expect(res.status).toBe(400);
  });

  it("rejects page=0", async () => {
    const res = await request(app).get("/api/v1/products").query({ page: "0" });
    expect(res.status).toBe(400);
  });

  it("rejects an unknown sort value", async () => {
    const res = await request(app).get("/api/v1/products").query({ sort: "bogus" });
    expect(res.status).toBe(400);
  });

  it("rejects minPrice greater than maxPrice", async () => {
    const res = await request(app).get("/api/v1/products").query({ minPrice: "500", maxPrice: "100" });
    expect(res.status).toBe(400);
  });

  it("rejects a negative minPrice", async () => {
    const res = await request(app).get("/api/v1/products").query({ minPrice: "-5" });
    expect(res.status).toBe(400);
  });
});
