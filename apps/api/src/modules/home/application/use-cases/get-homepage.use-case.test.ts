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
  categories?: { id: string; name: string; slug: string; sortOrder: number; imageUrl: string | null }[];
  categoryImages?: Map<string, string>;
  banners?: unknown[];
  budgetProducts?: unknown[];
}) {
  const newArrivalsLister = { execute: vi.fn().mockResolvedValue({ products: overrides.newArrivals ?? [], page: 1, limit: 8, total: 0 }) };
  const bestSellingVariantsReader = { execute: vi.fn().mockResolvedValue(overrides.variantSales ?? []) };
  const variantProductResolver = { execute: vi.fn().mockResolvedValue(overrides.variantToProduct ?? new Map()) };
  const productsByIdsReader = { execute: vi.fn().mockResolvedValue(overrides.productsById ?? new Map()) };
  const activeCollectionsLister = { execute: vi.fn().mockResolvedValue(overrides.collections ?? []) };
  const topApprovedReviewsReader = { execute: vi.fn().mockResolvedValue(overrides.reviews ?? []) };
  const categoriesLister = { execute: vi.fn().mockResolvedValue(overrides.categories ?? []) };
  const categoryImageResolver = { execute: vi.fn().mockResolvedValue(overrides.categoryImages ?? new Map()) };
  const visibleBannersLister = { execute: vi.fn().mockResolvedValue(overrides.banners ?? []) };
  const budgetProductsLister = { execute: vi.fn().mockResolvedValue({ products: overrides.budgetProducts ?? [], page: 1, limit: 1, total: 0 }) };

  const useCase = new GetHomePageUseCase(
    newArrivalsLister,
    bestSellingVariantsReader,
    variantProductResolver,
    productsByIdsReader,
    activeCollectionsLister,
    topApprovedReviewsReader,
    categoriesLister,
    categoryImageResolver,
    visibleBannersLister,
    budgetProductsLister,
  );

  return {
    useCase,
    newArrivalsLister,
    bestSellingVariantsReader,
    variantProductResolver,
    productsByIdsReader,
    activeCollectionsLister,
    topApprovedReviewsReader,
    categoriesLister,
    categoryImageResolver,
    visibleBannersLister,
    budgetProductsLister,
  };
}

describe("GetHomePageUseCase", () => {
  it("composes the visible banners list into the homepage payload unchanged (2026-08-31 promo carousel)", async () => {
    const banners = [{ id: "b1", imageUrl: "https://img/banner.jpg", title: "Sale", subtitle: null, ctaLabel: null, ctaUrl: null }];
    const { useCase } = makeUseCase({ banners });

    const result = await useCase.execute();

    expect(result.banners).toEqual(banners);
  });

  it("passes newest-sort through to the product lister for New Arrivals", async () => {
    const arrivals = [product("p1")];
    const { useCase, newArrivalsLister } = makeUseCase({ newArrivals: arrivals });

    const result = await useCase.execute();

    expect(newArrivalsLister.execute).toHaveBeenCalledWith({ sort: "newest", page: 1, limit: 8 });
    expect(result.newArrivals).toEqual(arrivals);
  });

  it("builds the category rail, preferring the category's own imageUrl, then a representative product image, else null", async () => {
    const { useCase } = makeUseCase({
      categories: [
        { id: "c1", name: "Tops", slug: "tops", sortOrder: 0, imageUrl: "/imgs/cat-tops.jpg" },
        { id: "c2", name: "Bottoms", slug: "bottoms", sortOrder: 1, imageUrl: null },
        { id: "c3", name: "Accessories", slug: "accessories", sortOrder: 2, imageUrl: null },
      ],
      categoryImages: new Map([
        ["c1", "https://img/derived-tops.jpg"], // ignored — c1 has its own imageUrl
        ["c2", "https://img/derived-bottoms.jpg"], // used — c2 has no own imageUrl
      ]),
    });

    const result = await useCase.execute();

    expect(result.categoryTiles).toEqual([
      { id: "c1", name: "Tops", slug: "tops", imageUrl: "/imgs/cat-tops.jpg" },
      { id: "c2", name: "Bottoms", slug: "bottoms", imageUrl: "https://img/derived-bottoms.jpg" },
      { id: "c3", name: "Accessories", slug: "accessories", imageUrl: null },
    ]);
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

  it("runs all sections independently — a section with no data doesn't block the others", async () => {
    const arrivals = [product("only-new")];
    const { useCase } = makeUseCase({ newArrivals: arrivals, variantSales: [], collections: [], reviews: [], categories: [] });

    const result = await useCase.execute();

    expect(result).toEqual({
      banners: [],
      categoryTiles: [],
      newArrivals: arrivals,
      bestSellers: [],
      featuredCollections: [],
      customerReviews: [],
      budgetTiles: [
        { label: "Under ₹499", maxPricePaise: 49_900, imageUrl: null },
        { label: "Under ₹799", maxPricePaise: 79_900, imageUrl: null },
        { label: "Under ₹999", maxPricePaise: 99_900, imageUrl: null },
      ],
    });
  });

  it("resolves each budget tile's cover image from the cheapest qualifying product", async () => {
    const { useCase, budgetProductsLister } = makeUseCase({});
    budgetProductsLister.execute.mockResolvedValueOnce({
      products: [{ primaryImage: { url: "https://img/under-499.jpg" } }],
      page: 1,
      limit: 1,
      total: 1,
    });

    const result = await useCase.execute();

    expect(budgetProductsLister.execute).toHaveBeenCalledTimes(3);
    expect(budgetProductsLister.execute).toHaveBeenCalledWith({ maxPricePaise: 49_900, sort: "price_desc", page: 1, limit: 1 });
    expect(result.budgetTiles[0]).toEqual({ label: "Under ₹499", maxPricePaise: 49_900, imageUrl: "https://img/under-499.jpg" });
    expect(result.budgetTiles[1]?.imageUrl).toBeNull();
  });
});
