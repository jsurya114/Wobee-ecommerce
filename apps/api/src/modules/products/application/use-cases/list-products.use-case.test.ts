import { describe, expect, it, vi } from "vitest";
import type { CategoryReaderPort } from "../ports/category-reader.port";
import type { CollectionReaderPort } from "../ports/collection-reader.port";
import type { InventoryReaderPort } from "../ports/inventory-reader.port";
import type { PricingReaderPort } from "../ports/pricing-reader.port";
import type { ProductRepositoryPort, ProductSummaryProjection } from "../ports/product-repository.port";
import { ListProductsUseCase } from "./list-products.use-case";

/** A repository projection (unresolved `from*` pricing, carries the raw representative variant). */
function projection(overrides: Partial<ProductSummaryProjection> = {}): ProductSummaryProjection {
  return {
    id: "product-1",
    slug: "product-1",
    name: "Product 1",
    brand: null,
    categoryId: "category-1",
    minPricePaiseCache: 1000,
    primaryImage: null,
    pricingMode: "WEIGHT_BASED",
    representativeVariant: { weightGrams: 250, ratePerKgOverridePaise: null },
    ...overrides,
  };
}

/** The resolved entity the use-case is expected to return for `projection(overrides)` given RATE below. */
function resolved(overrides: Partial<ProductSummaryProjection> = {}) {
  const { representativeVariant, pricingMode, ...rest } = projection(overrides);
  const isWeightBased = pricingMode === "WEIGHT_BASED";
  return {
    ...rest,
    fromWeightGrams: isWeightBased ? (representativeVariant?.weightGrams ?? null) : null,
    fromRatePerKgPaise: isWeightBased && representativeVariant ? RATE : null,
  };
}

const RATE = 120000;

function buildUseCase(overrides: {
  categoryIdBySlug?: string | null;
  collectionIdBySlug?: string | null;
  inStockVariantIds?: string[];
  findManyResult?: { products: ProductSummaryProjection[]; total: number };
} = {}) {
  const productRepository = {
    findMany: vi.fn().mockResolvedValue(overrides.findManyResult ?? { products: [projection()], total: 1 }),
    findBySlug: vi.fn(),
    findVariantsByIds: vi.fn(),
  } as unknown as ProductRepositoryPort;
  const categoryReader: CategoryReaderPort = {
    findIdBySlug: vi.fn().mockResolvedValue(overrides.categoryIdBySlug === undefined ? "category-1" : overrides.categoryIdBySlug),
  };
  const collectionReader: CollectionReaderPort = {
    findIdBySlug: vi.fn().mockResolvedValue(overrides.collectionIdBySlug === undefined ? "collection-1" : overrides.collectionIdBySlug),
  };
  const inventoryReader: InventoryReaderPort = {
    getAvailableQuantities: vi.fn(),
    findInStockVariantIds: vi.fn().mockResolvedValue(overrides.inStockVariantIds ?? ["variant-1"]),
  };
  const pricingReader: PricingReaderPort = {
    calculateMany: vi.fn().mockImplementation((inputs: { weightGrams: number }[]) =>
      Promise.resolve(inputs.map((input) => ({ pricePaise: Math.round((input.weightGrams * RATE) / 1000), ratePerKgPaise: RATE }))),
    ),
  };
  const useCase = new ListProductsUseCase(productRepository, categoryReader, collectionReader, inventoryReader, pricingReader);
  return { useCase, productRepository, categoryReader, collectionReader, inventoryReader, pricingReader };
}

describe("ListProductsUseCase", () => {
  it("resolves a category slug to an id and passes it to the repository", async () => {
    const { useCase, productRepository } = buildUseCase({ categoryIdBySlug: "category-42" });
    await useCase.execute({ categorySlug: "tops", sort: "price_asc", page: 1, limit: 20 });
    expect(productRepository.findMany).toHaveBeenCalledWith(expect.objectContaining({ categoryId: "category-42" }));
  });

  it("throws NotFoundError for an unknown category slug, without ever querying products", async () => {
    const { useCase, productRepository } = buildUseCase({ categoryIdBySlug: null });
    await expect(useCase.execute({ categorySlug: "does-not-exist", sort: "price_asc", page: 1, limit: 20 })).rejects.toThrow(
      "Unknown category: does-not-exist",
    );
    expect(productRepository.findMany).not.toHaveBeenCalled();
  });

  it("resolves a collection slug to an id and passes it to the repository", async () => {
    const { useCase, productRepository } = buildUseCase({ collectionIdBySlug: "collection-42" });
    await useCase.execute({ collectionSlug: "new-drops", sort: "price_asc", page: 1, limit: 20 });
    expect(productRepository.findMany).toHaveBeenCalledWith(expect.objectContaining({ collectionId: "collection-42" }));
  });

  it("throws NotFoundError for an unknown collection slug, without ever querying products", async () => {
    const { useCase, productRepository } = buildUseCase({ collectionIdBySlug: null });
    await expect(useCase.execute({ collectionSlug: "does-not-exist", sort: "price_asc", page: 1, limit: 20 })).rejects.toThrow(
      "Unknown collection: does-not-exist",
    );
    expect(productRepository.findMany).not.toHaveBeenCalled();
  });

  it("resolves in-stock variant ids live and passes them through when inStockOnly is set", async () => {
    const { useCase, productRepository, inventoryReader } = buildUseCase({ inStockVariantIds: ["variant-a", "variant-b"] });
    await useCase.execute({ inStockOnly: true, sort: "price_asc", page: 1, limit: 20 });
    expect(inventoryReader.findInStockVariantIds).toHaveBeenCalled();
    expect(productRepository.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ inStockVariantIds: ["variant-a", "variant-b"] }),
    );
  });

  it("short-circuits to an empty page when nothing is in stock, never querying products", async () => {
    const { useCase, productRepository } = buildUseCase({ inStockVariantIds: [] });
    const result = await useCase.execute({ inStockOnly: true, sort: "price_asc", page: 2, limit: 10 });
    expect(result).toEqual({ products: [], page: 2, limit: 10, total: 0 });
    expect(productRepository.findMany).not.toHaveBeenCalled();
  });

  it("resolves each product's `from` weight + rate/kg via one batched pricing call", async () => {
    const { useCase, pricingReader } = buildUseCase({
      findManyResult: {
        products: [
          projection({ id: "p1", representativeVariant: { weightGrams: 250, ratePerKgOverridePaise: null } }),
          projection({ id: "p2", representativeVariant: { weightGrams: 500, ratePerKgOverridePaise: 90000 } }),
          projection({ id: "p3", representativeVariant: null }),
        ],
        total: 3,
      },
    });
    const result = await useCase.execute({ sort: "price_asc", page: 1, limit: 20 });
    // one batched call, only for products that have a representative variant
    expect(pricingReader.calculateMany).toHaveBeenCalledTimes(1);
    expect(pricingReader.calculateMany).toHaveBeenCalledWith([
      { pricingMode: "WEIGHT_BASED", weightGrams: 250, ratePerKgOverridePaise: null, fixedPricePaise: null },
      { pricingMode: "WEIGHT_BASED", weightGrams: 500, ratePerKgOverridePaise: 90000, fixedPricePaise: null },
    ]);
    expect(result.products.map((p) => [p.id, p.fromWeightGrams, p.fromRatePerKgPaise])).toEqual([
      ["p1", 250, RATE],
      ["p2", 500, RATE],
      ["p3", null, null],
    ]);
    expect(result.products[0]).not.toHaveProperty("representativeVariant");
  });

  it("never calls the live-stock lookup when inStockOnly isn't requested", async () => {
    const { useCase, inventoryReader } = buildUseCase();
    await useCase.execute({ sort: "price_asc", page: 1, limit: 20 });
    expect(inventoryReader.findInStockVariantIds).not.toHaveBeenCalled();
  });

  it("passes search, size/color facets, price bounds and sort straight through to the repository", async () => {
    const { useCase, productRepository } = buildUseCase();
    await useCase.execute({
      q: "silk",
      sizes: ["M", "L"],
      colors: ["Red"],
      minPricePaise: 1000,
      maxPricePaise: 5000,
      sort: "newest",
      page: 1,
      limit: 20,
    });
    expect(productRepository.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        search: "silk",
        sizes: ["M", "L"],
        colors: ["Red"],
        minPricePaise: 1000,
        maxPricePaise: 5000,
        sort: "newest",
      }),
    );
  });

  it("returns the repository's total unchanged, echoing back the requested page/limit", async () => {
    const { useCase } = buildUseCase({
      findManyResult: { products: [projection({ id: "p1" }), projection({ id: "p2" })], total: 7 },
    });
    const result = await useCase.execute({ sort: "price_asc", page: 2, limit: 2 });
    expect(result).toEqual({ products: [resolved({ id: "p1" }), resolved({ id: "p2" })], page: 2, limit: 2, total: 7 });
  });
});
