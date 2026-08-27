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

// price_asc order (default sort): plainScarf < auroraJacket < breezeTop < auroraCoat < breezeSkirt
const PRICE_ASC_NAMES = ["plain-scarf", "aurora-jacket", "breeze-top", "aurora-coat", "breeze-skirt"];

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
    expect(res.body.total).toBe(4); // every fixture except plain-scarf carries the token
    expect(namesOf(res.body).every((n) => n.includes(SEARCH_TOKEN))).toBe(true);
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

describe("GET /api/v1/products — filters", () => {
  it("filters by category, isolated from other categories' products", async () => {
    const res = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(5);
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
    expect(res.body.total).toBe(2); // aurora-jacket + breeze-top are both Red

    const multi = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, color: "Red,Blue" });
    expect(multi.body.total).toBe(3); // + aurora-coat (Blue)
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

    const before = await request(app)
      .get("/api/v1/products")
      .query({ category: CATEGORY_SLUG, inStock: "true", q: "Breeze Top" });
    expect(before.body.total).toBe(0);

    await prisma.inventory.updateMany({ where: { variantId: outOfStockVariant.id }, data: { quantityAvailable: 4 } });
    try {
      const after = await request(app)
        .get("/api/v1/products")
        .query({ category: CATEGORY_SLUG, inStock: "true", q: "Breeze Top" });
      expect(after.body.total).toBe(1);
    } finally {
      // Restore, so later tests in this file (and re-runs) see the original zero-stock fixture.
      await prisma.inventory.updateMany({ where: { variantId: outOfStockVariant.id }, data: { quantityAvailable: 0 } });
    }
  });

  it("filters by inclusive price range against the display/sort cache", async () => {
    const res = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, minPrice: "15000", maxPrice: "25000" });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2); // breeze-top (15000) + aurora-coat (20000)
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
    // Fixtures were created oldest→newest as: aurora-jacket, aurora-coat, breeze-top, breeze-skirt, plain-scarf.
    const expectedNewestFirst = ["plain-scarf", "breeze-skirt", "breeze-top", "aurora-coat", "aurora-jacket"];
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

    expect(page1.body.total).toBe(5);
    expect(page2.body.total).toBe(5);
    expect(page3.body.total).toBe(5);
    expect(page1.body.products).toHaveLength(2);
    expect(page2.body.products).toHaveLength(2);
    expect(page3.body.products).toHaveLength(1);

    const allIds = [...page1.body.products, ...page2.body.products, ...page3.body.products].map((p: { id: string }) => p.id);
    expect(new Set(allIds).size).toBe(5); // no duplicate, no skipped row across pages
  });

  it("is stable — repeating the same page returns the identical order", async () => {
    const first = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, limit: 3, page: 1 });
    const second = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, limit: 3, page: 1 });
    expect(second.body.products.map((p: { id: string }) => p.id)).toEqual(first.body.products.map((p: { id: string }) => p.id));
  });

  it("caps limit at 50 by default and returns an empty page past the last one", async () => {
    const res = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, page: 99, limit: 10 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ products: [], total: 5, page: 99, limit: 10 });
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
