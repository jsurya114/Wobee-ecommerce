import { describe, expect, it, vi } from "vitest";
import type { PricingReaderPort } from "../ports/pricing-reader.port";
import type { ProductRepositoryPort, ProductSummaryProjection } from "../ports/product-repository.port";
import { GetRelatedProductsUseCase, RELATED_PRODUCTS_LIMIT } from "./get-related-products.use-case";

const RATE = 120000;

function projection(id: string, categoryId = "cat-1"): ProductSummaryProjection {
  return {
    id,
    slug: id,
    name: id,
    brand: null,
    categoryId,
    minPricePaiseCache: 1000,
    primaryImage: null,
    representativeVariant: { weightGrams: 250, ratePerKgOverridePaise: null },
  };
}

function build(overrides: {
  currentProduct?: { id: string; categoryId: string } | null;
  sameCategory?: ProductSummaryProjection[];
} = {}) {
  const current = overrides.currentProduct === undefined ? { id: "current", categoryId: "cat-1" } : overrides.currentProduct;
  const findBySlug = vi.fn().mockResolvedValue(
    current
      ? { id: current.id, category: { id: current.categoryId, name: "C", slug: "c" }, slug: "current", name: "Current", variants: [], images: [] }
      : null,
  );
  const findRelatedProducts = vi.fn().mockResolvedValue(overrides.sameCategory ?? []);
  const productRepository = { findBySlug, findRelatedProducts } as unknown as ProductRepositoryPort;
  const pricingReader: PricingReaderPort = {
    calculateMany: vi.fn().mockImplementation((inputs: { weightGrams: number }[]) =>
      Promise.resolve(inputs.map((i) => ({ pricePaise: Math.round((i.weightGrams * RATE) / 1000), ratePerKgPaise: RATE }))),
    ),
  };
  return { useCase: new GetRelatedProductsUseCase(productRepository, pricingReader), findBySlug, findRelatedProducts };
}

describe("GetRelatedProductsUseCase", () => {
  it("returns [] for an unknown/inactive slug without querying for related products", async () => {
    const { useCase, findRelatedProducts } = build({ currentProduct: null });
    await expect(useCase.execute("nope")).resolves.toEqual([]);
    expect(findRelatedProducts).not.toHaveBeenCalled();
  });

  it("asks the repository only for the current product's own category, excluding itself, capped at the limit", async () => {
    const { useCase, findRelatedProducts } = build({ sameCategory: [projection("a"), projection("b")] });

    await useCase.execute("current");

    expect(findRelatedProducts).toHaveBeenCalledTimes(1);
    expect(findRelatedProducts).toHaveBeenCalledWith({
      excludeProductId: "current",
      categoryId: "cat-1",
      limit: RELATED_PRODUCTS_LIMIT,
    });
  });

  it("returns [] when the category has no other products — never falls back to unrelated products", async () => {
    const { useCase, findRelatedProducts } = build({ sameCategory: [] });
    await expect(useCase.execute("current")).resolves.toEqual([]);
    // exactly one query — the same-category one — and no second/fallback call
    expect(findRelatedProducts).toHaveBeenCalledTimes(1);
  });

  it("resolves the from-pricing fields on each related product (no raw representativeVariant leaks out)", async () => {
    const { useCase } = build({ sameCategory: [projection("a")] });
    const result = await useCase.execute("current");
    expect(result[0]).toMatchObject({ id: "a", fromWeightGrams: 250, fromRatePerKgPaise: RATE });
    expect(result[0]).not.toHaveProperty("representativeVariant");
  });

  it("never includes the current product (the repository is told to exclude it)", async () => {
    const { useCase } = build({ sameCategory: [projection("a"), projection("b")] });
    const result = await useCase.execute("current");
    expect(result.map((p) => p.id)).not.toContain("current");
  });
});
