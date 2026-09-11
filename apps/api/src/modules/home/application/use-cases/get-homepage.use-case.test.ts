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
  testimonials?: unknown[];
  testimonialAggregate?: { approvedCount: number; averageRating: number | null };
  categories?: { id: string; name: string; slug: string; sortOrder: number; imageUrl: string | null }[];
  categoryImages?: Map<string, string>;
  banners?: unknown[];
  budgetProducts?: unknown[];
  /** Defaults to "every product id that appears in variantToProduct" — the common case where nothing is deliberately out of stock. */
  inStockProductIds?: Set<string>;
  sizeCounts?: Map<string, number>;
}) {
  const newArrivalsLister = { execute: vi.fn().mockResolvedValue({ products: overrides.newArrivals ?? [], page: 1, limit: 8, total: 0 }) };
  const bestSellingVariantsReader = { execute: vi.fn().mockResolvedValue(overrides.variantSales ?? []) };
  const variantProductResolver = { execute: vi.fn().mockResolvedValue(overrides.variantToProduct ?? new Map()) };
  const productsByIdsReader = { execute: vi.fn().mockResolvedValue(overrides.productsById ?? new Map()) };
  const activeCollectionsLister = { execute: vi.fn().mockResolvedValue(overrides.collections ?? []) };
  const approvedTestimonialsReader = { execute: vi.fn().mockResolvedValue(overrides.testimonials ?? []) };
  const aggregateTestimonialRatingReader = {
    execute: vi.fn().mockResolvedValue(overrides.testimonialAggregate ?? { approvedCount: 0, averageRating: null }),
  };
  const categoriesLister = { execute: vi.fn().mockResolvedValue(overrides.categories ?? []) };
  const categoryImageResolver = { execute: vi.fn().mockResolvedValue(overrides.categoryImages ?? new Map()) };
  const visibleBannersLister = { execute: vi.fn().mockResolvedValue(overrides.banners ?? []) };
  const budgetProductsLister = { execute: vi.fn().mockResolvedValue({ products: overrides.budgetProducts ?? [], page: 1, limit: 1, total: 0 }) };
  const inStockProductIdsProvider = {
    execute: vi.fn().mockResolvedValue(overrides.inStockProductIds ?? new Set((overrides.variantToProduct ?? new Map()).values())),
  };
  const sizeAvailabilityReader = { execute: vi.fn().mockResolvedValue(overrides.sizeCounts ?? new Map()) };

  const useCase = new GetHomePageUseCase(
    newArrivalsLister,
    bestSellingVariantsReader,
    variantProductResolver,
    productsByIdsReader,
    activeCollectionsLister,
    approvedTestimonialsReader,
    aggregateTestimonialRatingReader,
    categoriesLister,
    categoryImageResolver,
    visibleBannersLister,
    budgetProductsLister,
    inStockProductIdsProvider,
    sizeAvailabilityReader,
  );

  return {
    useCase,
    newArrivalsLister,
    bestSellingVariantsReader,
    variantProductResolver,
    productsByIdsReader,
    activeCollectionsLister,
    approvedTestimonialsReader,
    aggregateTestimonialRatingReader,
    categoriesLister,
    categoryImageResolver,
    visibleBannersLister,
    budgetProductsLister,
    inStockProductIdsProvider,
    sizeAvailabilityReader,
  };
}

describe("GetHomePageUseCase", () => {
  it("composes the visible banners list into the homepage payload unchanged (2026-08-31 promo carousel)", async () => {
    const banners = [{ id: "b1", imageUrl: "https://img/banner.jpg", title: "Sale", subtitle: null, ctaLabel: null, ctaUrl: null }];
    const { useCase } = makeUseCase({ banners });

    const result = await useCase.execute();

    expect(result.banners).toEqual(banners);
  });

  it("passes newest-sort + inStockOnly through to the product lister for New Arrivals (merchandising fix, 2026-09-06 — sold-out products must not linger in the rail)", async () => {
    const arrivals = [product("p1")];
    const { useCase, newArrivalsLister } = makeUseCase({ newArrivals: arrivals });

    const result = await useCase.execute();

    expect(newArrivalsLister.execute).toHaveBeenCalledWith({ sort: "newest", page: 1, limit: 8, inStockOnly: true });
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
    const { useCase, variantProductResolver, productsByIdsReader, inStockProductIdsProvider } = makeUseCase({ variantSales: [] });

    const result = await useCase.execute();

    expect(result.bestSellers).toEqual([]);
    expect(variantProductResolver.execute).not.toHaveBeenCalled();
    expect(productsByIdsReader.execute).not.toHaveBeenCalled();
    expect(inStockProductIdsProvider.execute).not.toHaveBeenCalled();
  });

  it("drops a Best Seller that sold well historically but has zero current stock (merchandising fix, 2026-09-06 — single-unit inventory means popular and buyable aren't the same question)", async () => {
    const { useCase } = makeUseCase({
      variantSales: [
        { variantId: "v1", quantitySold: 9 },
        { variantId: "v2", quantitySold: 5 },
      ],
      variantToProduct: new Map([
        ["v1", "sold-out-favorite"],
        ["v2", "back-in-stock"],
      ]),
      productsById: new Map([
        ["sold-out-favorite", product("sold-out-favorite")],
        ["back-in-stock", product("back-in-stock")],
      ]),
      // Only "back-in-stock" is currently available — "sold-out-favorite" outranks it but must not appear.
      inStockProductIds: new Set(["back-in-stock"]),
    });

    const result = await useCase.execute();

    expect(result.bestSellers.map((p) => p.id)).toEqual(["back-in-stock"]);
  });

  it("caps Featured Collections at 4 even when more active collections exist", async () => {
    const collections = Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, name: `Collection ${i}`, slug: `c${i}`, description: null, isActive: true }));
    const { useCase } = makeUseCase({ collections });

    const result = await useCase.execute();

    expect(result.featuredCollections).toHaveLength(4);
    expect(result.featuredCollections).toEqual(collections.slice(0, 4));
  });

  it("passes the approved testimonials list straight through — enrichment (display name, product info) already happened one layer down", async () => {
    const testimonials = [
      { id: "t1", rating: 5, text: "Lovely fabric and quick delivery", createdAt: new Date("2026-01-01"), displayName: "Anjali K.", images: [], verifiedCustomer: true as const },
    ];
    const { useCase } = makeUseCase({ testimonials });

    const result = await useCase.execute();

    expect(result.testimonials).toEqual(testimonials);
  });

  it("omits the aggregate rating when there are zero approved testimonials, never a fabricated 0/5", async () => {
    const { useCase } = makeUseCase({ testimonialAggregate: { approvedCount: 0, averageRating: null } });

    const result = await useCase.execute();

    expect(result.testimonialAggregate).toBeNull();
  });

  it("surfaces the real approved-only aggregate rating when testimonials exist", async () => {
    const { useCase } = makeUseCase({ testimonialAggregate: { approvedCount: 12, averageRating: 4.8 } });

    const result = await useCase.execute();

    expect(result.testimonialAggregate).toEqual({ approvedCount: 12, averageRating: 4.8 });
  });

  it("runs all sections independently — a section with no data doesn't block the others", async () => {
    const arrivals = [product("only-new")];
    const { useCase } = makeUseCase({ newArrivals: arrivals, variantSales: [], collections: [], testimonials: [], categories: [] });

    const result = await useCase.execute();

    expect(result).toEqual({
      banners: [],
      categoryTiles: [],
      newArrivals: arrivals,
      bestSellers: [],
      featuredCollections: [],
      testimonials: [],
      testimonialAggregate: null,
      budgetTiles: [
        { label: "Under ₹499", maxPricePaise: 49_900, imageUrl: null },
        { label: "Under ₹799", maxPricePaise: 79_900, imageUrl: null },
        { label: "Under ₹999", maxPricePaise: 99_900, imageUrl: null },
      ],
      sizeAvailability: [],
    });
  });

  it("resolves Shop Your Size in curated-size order, omitting any size with zero matching variants", async () => {
    const { useCase, sizeAvailabilityReader } = makeUseCase({
      sizeCounts: new Map([
        ["L", 3],
        ["XS", 1],
        ["M", 7],
        // "S", "XL", "XXL", "One Size" deliberately absent — zero matches.
      ]),
    });

    const result = await useCase.execute();

    expect(sizeAvailabilityReader.execute).toHaveBeenCalledWith(["XS", "S", "M", "L", "XL", "XXL", "One Size"]);
    // Curated order preserved (XS before M before L), not count-sorted.
    expect(result.sizeAvailability).toEqual([
      { size: "XS", count: 1 },
      { size: "M", count: 7 },
      { size: "L", count: 3 },
    ]);
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
