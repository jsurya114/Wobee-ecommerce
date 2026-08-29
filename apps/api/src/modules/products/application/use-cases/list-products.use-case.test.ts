import { describe, expect, it, vi } from "vitest";
import type { ProductSummaryEntity } from "../../domain/entities/product.entity";
import type { CategoryReaderPort } from "../ports/category-reader.port";
import type { CollectionReaderPort } from "../ports/collection-reader.port";
import type { InventoryReaderPort } from "../ports/inventory-reader.port";
import type { ProductRepositoryPort } from "../ports/product-repository.port";
import { ListProductsUseCase } from "./list-products.use-case";

function summary(overrides: Partial<ProductSummaryEntity> = {}): ProductSummaryEntity {
  return {
    id: "product-1",
    slug: "product-1",
    name: "Product 1",
    brand: null,
    categoryId: "category-1",
    minPricePaiseCache: 1000,
    primaryImage: null,
    ...overrides,
  };
}

function buildUseCase(overrides: {
  categoryIdBySlug?: string | null;
  collectionIdBySlug?: string | null;
  inStockVariantIds?: string[];
  findManyResult?: { products: ProductSummaryEntity[]; total: number };
} = {}) {
  const productRepository = {
    findMany: vi.fn().mockResolvedValue(overrides.findManyResult ?? { products: [summary()], total: 1 }),
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
  const useCase = new ListProductsUseCase(productRepository, categoryReader, collectionReader, inventoryReader);
  return { useCase, productRepository, categoryReader, collectionReader, inventoryReader };
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

  it("returns the repository's page/total unchanged, echoing back the requested page/limit", async () => {
    const products = [summary({ id: "p1" }), summary({ id: "p2" })];
    const { useCase } = buildUseCase({ findManyResult: { products, total: 7 } });
    const result = await useCase.execute({ sort: "price_asc", page: 2, limit: 2 });
    expect(result).toEqual({ products, page: 2, limit: 2, total: 7 });
  });
});
