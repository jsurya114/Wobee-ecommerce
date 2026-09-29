import { calculateWeightBasedPricePaise } from "@woobe/utils";
import { describe, expect, it, vi } from "vitest";
import type { PricingReaderPort } from "../../ports/pricing-reader.port";
import type { ProductRepositoryPort } from "../../ports/product-repository.port";
import { RefreshWeightBasedPriceCachesUseCase } from "./refresh-weight-based-price-caches.use-case";

const RATE = 150_000; // ₹1,500/kg

function makeUseCase(variants: Awaited<ReturnType<ProductRepositoryPort["findWeightBasedVariantsForRepricing"]>>) {
  const productRepository = {
    findWeightBasedVariantsForRepricing: vi.fn().mockResolvedValue(variants),
    updateVariantPriceCaches: vi.fn().mockResolvedValue(undefined),
  };
  // The real pricing path's weight math — the use-case must take prices from here, never compute its own.
  const pricingReader: PricingReaderPort = {
    calculateMany: vi.fn(async (inputs: Parameters<PricingReaderPort["calculateMany"]>[0]) => inputs.map((input) => ({ pricePaise: calculateWeightBasedPricePaise(input.weightGrams, RATE), ratePerKgPaise: RATE }))),
  };
  const useCase = new RefreshWeightBasedPriceCachesUseCase(productRepository as unknown as ProductRepositoryPort, pricingReader);
  return { useCase, productRepository, pricingReader };
}

describe("RefreshWeightBasedPriceCachesUseCase", () => {
  it("re-prices only the variants whose cached price no longer matches the current rate", async () => {
    const { useCase, productRepository, pricingReader } = makeUseCase([
      { id: "v-stale", productId: "p1", weightGrams: 240, ratePerKgOverridePaise: null, effectivePricePaiseCache: 28_800 }, // priced at ₹1,200/kg
      { id: "v-current", productId: "p1", weightGrams: 200, ratePerKgOverridePaise: null, effectivePricePaiseCache: 30_000 },
      { id: "v-other", productId: "p2", weightGrams: 325, ratePerKgOverridePaise: 99_000, effectivePricePaiseCache: 1 },
    ]);

    const changed = await useCase.execute();

    expect(pricingReader.calculateMany).toHaveBeenCalledWith([
      { pricingMode: "WEIGHT_BASED", weightGrams: 240, ratePerKgOverridePaise: null, fixedPricePaise: null },
      { pricingMode: "WEIGHT_BASED", weightGrams: 200, ratePerKgOverridePaise: null, fixedPricePaise: null },
      { pricingMode: "WEIGHT_BASED", weightGrams: 325, ratePerKgOverridePaise: 99_000, fixedPricePaise: null },
    ]);
    expect(productRepository.updateVariantPriceCaches).toHaveBeenCalledWith([
      { id: "v-stale", productId: "p1", effectivePricePaiseCache: 36_000 },
      { id: "v-other", productId: "p2", effectivePricePaiseCache: 48_750 }, // 325g × ₹1,500/kg
    ]);
    expect(changed).toBe(2);
  });

  it("does nothing when there are no weight-priced variants", async () => {
    const { useCase, productRepository, pricingReader } = makeUseCase([]);
    expect(await useCase.execute()).toBe(0);
    expect(pricingReader.calculateMany).not.toHaveBeenCalled();
    expect(productRepository.updateVariantPriceCaches).not.toHaveBeenCalled();
  });
});
