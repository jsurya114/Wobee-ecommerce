import { describe, expect, it, vi } from "vitest";
import { GetHomePageUseCase } from "./get-homepage.use-case";

function product(id: string, overrides: Partial<{ isActive: boolean; slug: string; name: string }> = {}) {
  return {
    id,
    slug: overrides.slug ?? `slug-${id}`,
    name: overrides.name ?? `Product ${id}`,
    brand: null,
    categoryId: "cat-1",
    minPricePaiseCache: 1000,
    primaryImage: null,
    isActive: overrides.isActive ?? true,
  };
}

function makeUseCase(overrides: {
  newArrivals?: unknown[];
  variantSales?: { variantId: string; quantitySold: number }[];
  variantToProduct?: Map<string, string>;
  productsById?: Map<string, ReturnType<typeof product>>;
  collections?: unknown[];
  reviews?: unknown[];
}) {
  const newArrivalsLister = { execute: vi.fn().mockResolvedValue({ products: overrides.newArrivals ?? [], page: 1, limit: 8, total: 0 }) };
  const bestSellingVariantsReader = { execute: vi.fn().mockResolvedValue(overrides.variantSales ?? []) };
  const variantProductResolver = { execute: vi.fn().mockResolvedValue(overrides.variantToProduct ?? new Map()) };
  const productsByIdsReader = { execute: vi.fn().mockResolvedValue(overrides.productsById ?? new Map()) };
  const activeCollectionsLister = { execute: vi.fn().mockResolvedValue(overrides.collections ?? []) };
  const topApprovedReviewsReader = { execute: vi.fn().mockResolvedValue(overrides.reviews ?? []) };

  const useCase = new GetHomePageUseCase(
    newArrivalsLister,
    bestSellingVariantsReader,
    variantProductResolver,
    productsByIdsReader,
    activeCollectionsLister,
    topApprovedReviewsReader,
  );

  return { useCase, newArrivalsLister, bestSellingVariantsReader, variantProductResolver, productsByIdsReader, activeCollectionsLister, topApprovedReviewsReader };
}

describe("GetHomePageUseCase", () => {
  it("passes newest-sort through to the product lister for New Arrivals", async () => {
    const arrivals = [product("p1")];
    const { useCase, newArrivalsLister } = makeUseCase({ newArrivals: arrivals });

    const result = await useCase.execute();

    expect(newArrivalsLister.execute).toHaveBeenCalledWith({ sort: "newest", page: 1, limit: 8 });
    expect(result.newArrivals).toEqual(arrivals);
  });

  it("collapses variant-level sales to product-level, ranked by total units sold across variants of the same product", async () => {
    // p1 sells 5+4=9 total (two colourways), p2 sells 8 in one variant — p1's combined total should outrank p2's single-variant total.
    const { useCase } = makeUseCase({
      variantSales: [
        { variantId: "v-p2-a", quantitySold: 8 },
        { variantId: "v-p1-a", quantitySold: 5 },
        { variantId: "v-p1-b", quantitySold: 4 },
      ],
      variantToProduct: new Map([
        ["v-p2-a", "p2"],
        ["v-p1-a", "p1"],
        ["v-p1-b", "p1"],
      ]),
      productsById: new Map([
        ["p1", product("p1")],
        ["p2", product("p2")],
      ]),
    });

    const result = await useCase.execute();

    expect(result.bestSellers.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("drops an inactive product from Best Sellers rather than linking to a dead product page", async () => {
    const { useCase } = makeUseCase({
      variantSales: [{ variantId: "v1", quantitySold: 3 }],
      variantToProduct: new Map([["v1", "p1"]]),
      productsById: new Map([["p1", product("p1", { isActive: false })]]),
    });

    const result = await useCase.execute();

    expect(result.bestSellers).toEqual([]);
  });

  it("skips a variant that no longer resolves to a product, without failing the whole rail", async () => {
    const { useCase } = makeUseCase({
      variantSales: [
        { variantId: "v-deleted", quantitySold: 100 },
        { variantId: "v1", quantitySold: 1 },
      ],
      variantToProduct: new Map([["v1", "p1"]]), // v-deleted intentionally absent
      productsById: new Map([["p1", product("p1")]]),
    });

    const result = await useCase.execute();

    expect(result.bestSellers.map((p) => p.id)).toEqual(["p1"]);
  });

  it("returns an empty Best Sellers rail when there's no sales history yet, without calling the product resolver", async () => {
    const { useCase, variantProductResolver, productsByIdsReader } = makeUseCase({ variantSales: [] });

    const result = await useCase.execute();

    expect(result.bestSellers).toEqual([]);
    expect(variantProductResolver.execute).not.toHaveBeenCalled();
    expect(productsByIdsReader.execute).not.toHaveBeenCalled();
  });

  it("caps Featured Collections at 4 even when more active collections exist", async () => {
    const collections = Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, name: `Collection ${i}`, slug: `c${i}`, description: null, isActive: true }));
    const { useCase } = makeUseCase({ collections });

    const result = await useCase.execute();

    expect(result.featuredCollections).toHaveLength(4);
    expect(result.featuredCollections).toEqual(collections.slice(0, 4));
  });

  it("enriches each review with its product's name/slug/image and never a reviewer name", async () => {
    const reviewedProduct = product("p1", { slug: "silk-scarf", name: "Silk Scarf" });
    const { useCase } = makeUseCase({
      reviews: [{ id: "r1", productId: "p1", rating: 5, title: "Lovely", body: "Great fabric", status: "APPROVED", isVerifiedPurchase: true, createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-01") }],
      productsById: new Map([["p1", reviewedProduct]]),
    });

    const result = await useCase.execute();

    expect(result.customerReviews).toEqual([
      { id: "r1", rating: 5, title: "Lovely", body: "Great fabric", createdAt: new Date("2026-01-01"), product: { id: "p1", slug: "silk-scarf", name: "Silk Scarf", image: null } },
    ]);
    expect(result.customerReviews[0]).not.toHaveProperty("userId");
  });

  it("drops a review whose product has since gone inactive", async () => {
    const { useCase } = makeUseCase({
      reviews: [{ id: "r1", productId: "p1", rating: 5, title: null, body: null, status: "APPROVED", isVerifiedPurchase: false, createdAt: new Date(), updatedAt: new Date() }],
      productsById: new Map([["p1", product("p1", { isActive: false })]]),
    });

    const result = await useCase.execute();

    expect(result.customerReviews).toEqual([]);
  });

  it("stops enriching reviews once 6 have been collected, even if more were fetched", async () => {
    const reviews = Array.from({ length: 12 }, (_, i) => ({
      id: `r${i}`,
      productId: "p1",
      rating: 5,
      title: null,
      body: null,
      status: "APPROVED" as const,
      isVerifiedPurchase: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const { useCase } = makeUseCase({ reviews, productsById: new Map([["p1", product("p1")]]) });

    const result = await useCase.execute();

    expect(result.customerReviews).toHaveLength(6);
  });

  it("runs all four sections independently — a section with no data doesn't block the others", async () => {
    const arrivals = [product("only-new")];
    const { useCase } = makeUseCase({ newArrivals: arrivals, variantSales: [], collections: [], reviews: [] });

    const result = await useCase.execute();

    expect(result).toEqual({ newArrivals: arrivals, bestSellers: [], featuredCollections: [], customerReviews: [] });
  });
});
