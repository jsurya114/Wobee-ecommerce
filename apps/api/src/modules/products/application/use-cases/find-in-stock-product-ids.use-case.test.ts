import { describe, expect, it, vi } from "vitest";
import type { InventoryReaderPort } from "../ports/inventory-reader.port";
import type { ProductRepositoryPort } from "../ports/product-repository.port";
import { FindInStockProductIdsUseCase } from "./find-in-stock-product-ids.use-case";

describe("FindInStockProductIdsUseCase", () => {
  it("resolves the live in-stock variant set to the products with an ACTIVE variant among them", async () => {
    const inventoryReader = { findInStockVariantIds: vi.fn().mockResolvedValue(["v1", "v2"]), getAvailableQuantities: vi.fn() };
    const productRepository = { findProductIdsWithActiveVariants: vi.fn().mockResolvedValue(new Set(["p1"])) };
    const useCase = new FindInStockProductIdsUseCase(inventoryReader as InventoryReaderPort, productRepository as unknown as ProductRepositoryPort);

    expect(await useCase.execute()).toEqual(new Set(["p1"]));
    expect(productRepository.findProductIdsWithActiveVariants).toHaveBeenCalledWith(["v1", "v2"]);
  });
});
