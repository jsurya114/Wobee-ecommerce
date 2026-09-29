import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";
import { refreshWeightBasedPriceCachesUseCase } from "./products.module";

/**
 * "Shop by Budget" (2026-09-30) against the REAL test database. A budget
 * tile links to `/products?maxPrice=<paise>&sort=price_desc`, and the budget
 * is a MAXIMUM: price <= cap, inclusive.
 *
 * The reported leak (₹488 under a ₹299 budget) came from the listing's price
 * cache, not the query: `minPricePaiseCache` was never re-priced when the
 * admin changed the global ₹/kg rate, so a weight-priced product kept its
 * old (lower) price in the filter. The last describe drives that through the
 * real admin endpoint.
 *
 * Own category and fixtures, all in stock, FIXED-priced (exact prices,
 * independent of the global rate) except the one weight-priced product.
 */

const app = createApp();
const SUFFIX = crypto.randomUUID().slice(0, 8);
const CATEGORY_SLUG = `budget-cat-${SUFFIX}`;
const OTHER_CATEGORY_SLUG = `budget-other-${SUFFIX}`;
const TOKEN = `Budgetq${SUFFIX}`;
const testStartedAt = new Date();

type Fixture = { key: string; pricePaise: number; color: string; size: string; category?: "other" };
// createdAt increases down the list, so "newest" is the reverse of this order.
const FIXTURES: Fixture[] = [
  { key: "p100", pricePaise: 10_000, color: "Red", size: "S" },
  { key: "p200", pricePaise: 20_000, color: "Blue", size: "M" },
  { key: "p299", pricePaise: 29_900, color: "Red", size: "M" },
  { key: "p300", pricePaise: 30_000, color: "Red", size: "M" },
  { key: "p488", pricePaise: 48_800, color: "Blue", size: "S" },
  { key: "p499", pricePaise: 49_900, color: "Red", size: "L" },
  { key: "p500", pricePaise: 50_000, color: "Blue", size: "M" },
  { key: "other250", pricePaise: 25_000, color: "Red", size: "M", category: "other" },
];

const nameOf = (key: string) => `${TOKEN} ${key}`;
let categoryId: string;
let otherCategoryId: string;
let warehouseId: string;
const createdProductIds: string[] = [];

beforeAll(async () => {
  categoryId = (await prisma.category.create({ data: { name: `Budget ${SUFFIX}`, slug: CATEGORY_SLUG, isActive: true } })).id;
  otherCategoryId = (await prisma.category.create({ data: { name: `Budget other ${SUFFIX}`, slug: OTHER_CATEGORY_SLUG, isActive: true } })).id;
  warehouseId = (await prisma.warehouse.findFirstOrThrow({ where: { isActive: true } })).id;

  const base = Date.now() - FIXTURES.length * 1000;
  for (const [index, fixture] of FIXTURES.entries()) {
    const product = await prisma.product.create({
      data: {
        name: nameOf(fixture.key),
        slug: `budget-${fixture.key}-${SUFFIX}`,
        categoryId: fixture.category === "other" ? otherCategoryId : categoryId,
        pricingMode: "FIXED",
        isActive: true,
        minPricePaiseCache: fixture.pricePaise,
        createdAt: new Date(base + index * 1000),
      },
    });
    createdProductIds.push(product.id);
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: `BUDGET-${fixture.key}-${SUFFIX}`.toUpperCase(),
        color: fixture.color,
        size: fixture.size,
        weightGrams: 200,
        fixedPricePaise: fixture.pricePaise,
        effectivePricePaiseCache: fixture.pricePaise,
        isActive: true,
      },
    });
    await prisma.inventory.create({ data: { variantId: variant.id, warehouseId, quantityAvailable: 5, quantityReserved: 0 } });
  }
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
  await prisma.category.deleteMany({ where: { id: { in: [categoryId, otherCategoryId] } } });
  await prisma.$disconnect();
});

async function list(query: Record<string, string | number>) {
  const res = await request(app).get("/api/v1/products").query({ category: CATEGORY_SLUG, limit: 50, ...query });
  expect(res.status).toBe(200);
  return res.body as { products: { name: string; minPricePaiseCache: number; offerPricePaise: number }[]; total: number };
}
const namesOf = (body: { products: { name: string }[] }) => body.products.map((p) => p.name);

describe("Shop by Budget — maxPrice is an inclusive maximum", () => {
  it("₹299: shows ₹100 / ₹200 / ₹299, hides ₹300 / ₹488 / ₹499 / ₹500", async () => {
    const body = await list({ maxPrice: 29_900, sort: "price_desc" });
    expect(namesOf(body)).toEqual([nameOf("p299"), nameOf("p200"), nameOf("p100")]);
    expect(body.total).toBe(3);
    expect(body.products.every((p) => p.minPricePaiseCache <= 29_900 && p.offerPricePaise <= 29_900)).toBe(true);
  });

  it("₹499: shows up to and including ₹499, hides ₹500", async () => {
    const body = await list({ maxPrice: 49_900, sort: "price_desc" });
    expect(namesOf(body)).toEqual(["p499", "p488", "p300", "p299", "p200", "p100"].map(nameOf));
    expect(namesOf(body)).not.toContain(nameOf("p500"));
  });

  it("changing the budget never keeps the previous cap, and removing it restores every price", async () => {
    expect((await list({ maxPrice: 29_900 })).total).toBe(3);
    expect((await list({ maxPrice: 49_900 })).total).toBe(6);
    const b199 = await list({ maxPrice: 19_900 });
    expect(namesOf(b199)).toEqual([nameOf("p100")]);
    const reset = await list({});
    expect(reset.total).toBe(7);
  });

  it("combines with category: another category's product under the cap never leaks in", async () => {
    const body = await list({ maxPrice: 29_900 });
    expect(namesOf(body)).not.toContain(nameOf("other250"));
    const other = await request(app).get("/api/v1/products").query({ category: OTHER_CATEGORY_SLUG, maxPrice: 29_900 });
    expect(other.body.products.map((p: { name: string }) => p.name)).toEqual([nameOf("other250")]);
  });

  it("combines with size and colour", async () => {
    const bySize = await list({ maxPrice: 29_900, size: "M" });
    expect(namesOf(bySize).sort()).toEqual([nameOf("p200"), nameOf("p299")].sort()); // p300 is M but over budget
    const byColor = await list({ maxPrice: 29_900, color: "Red" });
    expect(namesOf(byColor).sort()).toEqual([nameOf("p100"), nameOf("p299")].sort()); // p300 / p499 are Red but over budget
  });

  it("combines with search", async () => {
    const body = await list({ maxPrice: 29_900, q: "p2" });
    expect(namesOf(body).sort()).toEqual([nameOf("p200"), nameOf("p299")].sort());
  });

  it("combines with every sort", async () => {
    const asc = await list({ maxPrice: 29_900, sort: "price_asc" });
    expect(namesOf(asc)).toEqual(["p100", "p200", "p299"].map(nameOf));
    const newest = await list({ maxPrice: 29_900, sort: "newest" });
    expect(namesOf(newest)).toEqual(["p299", "p200", "p100"].map(nameOf));
  });

  it("paginates within the budget — no page ever carries an over-budget product", async () => {
    const page1 = await list({ maxPrice: 49_900, sort: "price_desc", limit: 4, page: 1 });
    const page2 = await list({ maxPrice: 49_900, sort: "price_desc", limit: 4, page: 2 });
    expect(page1.total).toBe(6);
    expect(page2.total).toBe(6);
    const all = [...page1.products, ...page2.products];
    expect(all).toHaveLength(6);
    expect(new Set(all.map((p) => p.name)).size).toBe(6);
    expect(all.every((p) => p.minPricePaiseCache <= 49_900)).toBe(true);
  });
});

describe("Shop by Budget — a ₹/kg rate change re-prices the listing (the ₹488-under-₹299 leak)", () => {
  it("a weight-priced product listed under ₹299 leaves that budget once the rate makes it ₹488", async () => {
    const product = await prisma.product.create({
      data: { name: nameOf("weighed"), slug: `budget-weighed-${SUFFIX}`, categoryId, pricingMode: "WEIGHT_BASED", isActive: true },
    });
    createdProductIds.push(product.id);
    const variant = await prisma.productVariant.create({
      data: { productId: product.id, sku: `BUDGET-WEIGHED-${SUFFIX}`.toUpperCase(), color: "Green", size: "M", weightGrams: 200, isActive: true },
    });
    await prisma.inventory.create({ data: { variantId: variant.id, warehouseId, quantityAvailable: 5, quantityReserved: 0 } });

    const login = await request(app).post("/api/v1/admin/auth/login").send({ email: "admin@woobe.in", password: "Admin@12345" });
    expect(login.status).toBe(200);
    const token = login.body.accessToken as string;

    try {
      // Price the product at a rate under which 200g is ₹240 (inside the ₹299 budget).
      expect((await request(app).put("/api/v1/admin/settings/pricing").set("Authorization", `Bearer ${token}`).send({ ratePerKgPaise: 120_000 })).status).toBe(200);
      const before = await list({ maxPrice: 29_900 });
      expect(before.products.find((p) => p.name === nameOf("weighed"))?.minPricePaiseCache).toBe(24_000);

      // Raise the rate: 200g now costs ₹488 everywhere — PDP, cart, checkout AND the listing.
      const raised = await request(app).put("/api/v1/admin/settings/pricing").set("Authorization", `Bearer ${token}`).send({ ratePerKgPaise: 244_000 });
      expect(raised.status).toBe(200);

      const under299 = await list({ maxPrice: 29_900 });
      expect(namesOf(under299)).not.toContain(nameOf("weighed"));

      const under499 = await list({ maxPrice: 49_900 });
      const listed = under499.products.find((p) => p.name === nameOf("weighed"));
      expect(listed?.minPricePaiseCache).toBe(48_800);

      const pdp = await request(app).get(`/api/v1/products/budget-weighed-${SUFFIX}`);
      expect(pdp.body.product.variants[0].pricePaise).toBe(48_800); // the live price and the listing now agree
    } finally {
      // Restore the global rate other suites read, then re-price every cache against it.
      await prisma.pricingSetting.deleteMany({ where: { effectiveFrom: { gte: testStartedAt } } });
      await refreshWeightBasedPriceCachesUseCase.execute();
    }
  });
});
