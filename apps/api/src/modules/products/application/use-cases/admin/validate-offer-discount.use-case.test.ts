import { describe, expect, it, vi } from "vitest";
import type { ProductRepositoryPort } from "../../ports/product-repository.port";
import { ValidateOfferDiscountUseCase, type OfferDiscountValidationInput } from "./validate-offer-discount.use-case";

function build(minPricePaise: number | null) {
  const productRepository = {
    getMinPricePaiseForOfferTarget: vi.fn().mockResolvedValue(minPricePaise),
  } as unknown as ProductRepositoryPort;
  return { useCase: new ValidateOfferDiscountUseCase(productRepository), productRepository };
}

function input(overrides: Partial<OfferDiscountValidationInput> = {}): OfferDiscountValidationInput {
  return {
    discountType: "FIXED_AMOUNT",
    discountValue: 200_00,
    scope: "PRODUCTS",
    categoryId: null,
    productIds: ["product-1"],
    ...overrides,
  };
}

describe("ValidateOfferDiscountUseCase", () => {
  it("accepts a fixed discount less than the cheapest applicable product's price", async () => {
    const { useCase } = build(200_00);
    expect(await useCase.execute(input({ discountValue: 199_00 }))).toBeNull();
  });

  it("accepts a fixed discount exactly equal to the cheapest applicable product's price (final price ₹0)", async () => {
    const { useCase } = build(200_00);
    expect(await useCase.execute(input({ discountValue: 200_00 }))).toBeNull();
  });

  it("rejects a fixed discount larger than the cheapest applicable product's price", async () => {
    const { useCase } = build(200_00);
    const error = await useCase.execute(input({ discountValue: 201_00 }));
    expect(error).toMatch(/cannot exceed/i);
    expect(error).toMatch(/₹200\.00/);
  });

  it("skips the check entirely for a PERCENTAGE offer — bounded elsewhere by validateOfferInput's 1-100 range", async () => {
    const { useCase, productRepository } = build(200_00);
    expect(await useCase.execute(input({ discountType: "PERCENTAGE", discountValue: 100 }))).toBeNull();
    expect(productRepository.getMinPricePaiseForOfferTarget).not.toHaveBeenCalled();
  });

  it("accepts any fixed discount when the target currently has no priced product (nothing to validate against yet)", async () => {
    const { useCase } = build(null);
    expect(await useCase.execute(input({ discountValue: 999_00 }))).toBeNull();
  });

  it("queries the ALL_PRODUCTS floor for a storewide offer", async () => {
    const { useCase, productRepository } = build(50_00);
    await useCase.execute(input({ scope: "ALL_PRODUCTS", productIds: [], discountValue: 51_00 }));
    expect(productRepository.getMinPricePaiseForOfferTarget).toHaveBeenCalledWith({ scope: "ALL_PRODUCTS" });
  });

  it("queries the CATEGORY floor by categoryId for a category-scoped offer", async () => {
    const { useCase, productRepository } = build(50_00);
    await useCase.execute(input({ scope: "CATEGORY", categoryId: "category-1", productIds: [], discountValue: 10_00 }));
    expect(productRepository.getMinPricePaiseForOfferTarget).toHaveBeenCalledWith({ scope: "CATEGORY", categoryId: "category-1" });
  });

  it("queries the PRODUCTS floor by productIds for a product-scoped offer", async () => {
    const { useCase, productRepository } = build(50_00);
    await useCase.execute(input({ scope: "PRODUCTS", productIds: ["product-1", "product-2"], discountValue: 10_00 }));
    expect(productRepository.getMinPricePaiseForOfferTarget).toHaveBeenCalledWith({ scope: "PRODUCTS", productIds: ["product-1", "product-2"] });
  });

  it("skips the repository call for a malformed CATEGORY offer with no categoryId — validateOfferInput rejects that shape instead", async () => {
    const { useCase, productRepository } = build(50_00);
    expect(await useCase.execute(input({ scope: "CATEGORY", categoryId: null, discountValue: 999_00 }))).toBeNull();
    expect(productRepository.getMinPricePaiseForOfferTarget).not.toHaveBeenCalled();
  });

  it("skips the repository call for a malformed PRODUCTS offer with an empty product list — validateOfferInput rejects that shape instead", async () => {
    const { useCase, productRepository } = build(50_00);
    expect(await useCase.execute(input({ scope: "PRODUCTS", productIds: [], discountValue: 999_00 }))).toBeNull();
    expect(productRepository.getMinPricePaiseForOfferTarget).not.toHaveBeenCalled();
  });
});
