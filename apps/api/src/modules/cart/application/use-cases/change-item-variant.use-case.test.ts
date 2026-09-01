import { describe, expect, it, vi } from "vitest";
import { ChangeItemVariantUseCase } from "./change-item-variant.use-case";
import type { CartItemRecord } from "../ports/cart-repository.port";

const PRODUCT_A = "product-a";
const PRODUCT_B = "product-b";

function makeVariant(id: string, productId: string, isActive = true) {
  return {
    id,
    productId,
    categoryId: "category-1",
    pricingMode: "WEIGHT_BASED" as const,
    productName: "Test Product",
    productSlug: "test-product",
    image: null,
    sku: id,
    color: "Black",
    size: id,
    weightGrams: 100,
    ratePerKgOverridePaise: null,
    fixedPricePaise: null,
    isActive,
  };
}

function makeItem(overrides: Partial<CartItemRecord>): CartItemRecord {
  return { id: "item-1", cartId: "cart-1", variantId: "variant-m", quantity: 1, ...overrides };
}

describe("ChangeItemVariantUseCase", () => {
  it("throws NotFoundError when the cart item does not exist", async () => {
    const cartRepository = { findItem: vi.fn().mockResolvedValue(null) };
    const useCase = new ChangeItemVariantUseCase(cartRepository as never, {} as never, {} as never);

    await expect(useCase.execute({ cartId: "cart-1", itemId: "missing", variantId: "variant-l" })).rejects.toThrow(
      "Cart item not found",
    );
  });

  it("is a no-op when the target variant is already the item's current variant", async () => {
    const item = makeItem({ variantId: "variant-m" });
    const cartRepository = {
      findItem: vi.fn().mockResolvedValue(item),
      setItemVariant: vi.fn(),
      setItemQuantity: vi.fn(),
      findItemByVariant: vi.fn(),
    };
    const useCase = new ChangeItemVariantUseCase(cartRepository as never, {} as never, {} as never);

    await useCase.execute({ cartId: "cart-1", itemId: "item-1", variantId: "variant-m" });

    expect(cartRepository.setItemVariant).not.toHaveBeenCalled();
    expect(cartRepository.findItemByVariant).not.toHaveBeenCalled();
  });

  it("rejects switching to a variant of a different product", async () => {
    const item = makeItem({ variantId: "variant-m" });
    const cartRepository = { findItem: vi.fn().mockResolvedValue(item) };
    const variantCatalog = {
      getVariants: vi.fn().mockResolvedValue(
        new Map([
          ["variant-m", makeVariant("variant-m", PRODUCT_A)],
          ["variant-other", makeVariant("variant-other", PRODUCT_B)],
        ]),
      ),
    };
    const useCase = new ChangeItemVariantUseCase(cartRepository as never, variantCatalog as never, {} as never);

    await expect(useCase.execute({ cartId: "cart-1", itemId: "item-1", variantId: "variant-other" })).rejects.toThrow(
      "That size does not belong to this product",
    );
  });

  it("rejects a sold-out target variant and leaves the existing item untouched", async () => {
    const item = makeItem({ variantId: "variant-m" });
    const cartRepository = {
      findItem: vi.fn().mockResolvedValue(item),
      setItemVariant: vi.fn(),
      setItemQuantity: vi.fn(),
    };
    const variantCatalog = {
      getVariants: vi.fn().mockResolvedValue(
        new Map([
          ["variant-m", makeVariant("variant-m", PRODUCT_A)],
          ["variant-l", makeVariant("variant-l", PRODUCT_A)],
        ]),
      ),
    };
    const inventoryReader = { getAvailableQuantities: vi.fn().mockResolvedValue(new Map([["variant-l", 0]])) };
    const useCase = new ChangeItemVariantUseCase(cartRepository as never, variantCatalog as never, inventoryReader as never);

    await expect(useCase.execute({ cartId: "cart-1", itemId: "item-1", variantId: "variant-l" })).rejects.toThrow(
      "That size is out of stock",
    );
    expect(cartRepository.setItemVariant).not.toHaveBeenCalled();
    expect(cartRepository.setItemQuantity).not.toHaveBeenCalled();
  });

  it("swaps the variant and caps quantity to available stock when no line for the target variant exists", async () => {
    const item = makeItem({ variantId: "variant-m", quantity: 3 });
    const cartRepository = {
      findItem: vi.fn().mockResolvedValue(item),
      findItemByVariant: vi.fn().mockResolvedValue(null),
      setItemVariant: vi.fn().mockResolvedValue(undefined),
      setItemQuantity: vi.fn().mockResolvedValue(undefined),
    };
    const variantCatalog = {
      getVariants: vi.fn().mockResolvedValue(
        new Map([
          ["variant-m", makeVariant("variant-m", PRODUCT_A)],
          ["variant-l", makeVariant("variant-l", PRODUCT_A)],
        ]),
      ),
    };
    const inventoryReader = { getAvailableQuantities: vi.fn().mockResolvedValue(new Map([["variant-l", 2]])) };
    const useCase = new ChangeItemVariantUseCase(cartRepository as never, variantCatalog as never, inventoryReader as never);

    await useCase.execute({ cartId: "cart-1", itemId: "item-1", variantId: "variant-l" });

    expect(cartRepository.setItemVariant).toHaveBeenCalledWith("item-1", "variant-l");
    expect(cartRepository.setItemQuantity).toHaveBeenCalledWith("item-1", 2);
  });

  it("merges into an existing line for the target variant instead of creating a duplicate", async () => {
    const item = makeItem({ id: "item-1", variantId: "variant-m", quantity: 1 });
    const existingTargetItem = makeItem({ id: "item-2", variantId: "variant-l", quantity: 1 });
    const cartRepository = {
      findItem: vi.fn().mockResolvedValue(item),
      findItemByVariant: vi.fn().mockResolvedValue(existingTargetItem),
      setItemVariant: vi.fn(),
      setItemQuantity: vi.fn().mockResolvedValue(undefined),
      removeItem: vi.fn().mockResolvedValue(undefined),
    };
    const variantCatalog = {
      getVariants: vi.fn().mockResolvedValue(
        new Map([
          ["variant-m", makeVariant("variant-m", PRODUCT_A)],
          ["variant-l", makeVariant("variant-l", PRODUCT_A)],
        ]),
      ),
    };
    const inventoryReader = { getAvailableQuantities: vi.fn().mockResolvedValue(new Map([["variant-l", 10]])) };
    const useCase = new ChangeItemVariantUseCase(cartRepository as never, variantCatalog as never, inventoryReader as never);

    await useCase.execute({ cartId: "cart-1", itemId: "item-1", variantId: "variant-l" });

    expect(cartRepository.setItemQuantity).toHaveBeenCalledWith("item-2", 2);
    expect(cartRepository.removeItem).toHaveBeenCalledWith("item-1");
    expect(cartRepository.setItemVariant).not.toHaveBeenCalled();
  });
});
