// Composition root for the products module (ARCHITECTURE.md §3.2) — wires
// repos/services to use-cases to routes, and wires this module's own ports
// to other modules' exported use-cases (categories, pricing, inventory) as
// trivial pass-through adapters, keeping the dependency-cruiser boundary
// intact (no Prisma import outside infrastructure/).
import { findCategoryBySlugUseCase } from "../categories/categories.module";
import { getAvailableQuantitiesUseCase } from "../inventory/inventory.module";
import { calculateEffectivePriceUseCase } from "../pricing/pricing.module";
import type { CategoryReaderPort } from "./application/ports/category-reader.port";
import type { InventoryReaderPort } from "./application/ports/inventory-reader.port";
import type { PricingReaderPort } from "./application/ports/pricing-reader.port";
import { GetProductBySlugUseCase } from "./application/use-cases/get-product-by-slug.use-case";
import { GetVariantsForCartUseCase } from "./application/use-cases/get-variants-for-cart.use-case";
import { ListProductsUseCase } from "./application/use-cases/list-products.use-case";
import { ProductRepository } from "./infrastructure/repositories/product.repository";
import { ProductsController } from "./interface/http/products.controller";
import { createProductsRouter } from "./interface/http/products.routes";

const productRepository = new ProductRepository();

const categoryReader: CategoryReaderPort = { findIdBySlug: (slug) => findCategoryBySlugUseCase.execute(slug) };
const pricingReader: PricingReaderPort = { calculateMany: (inputs) => calculateEffectivePriceUseCase.executeMany(inputs) };
const inventoryReader: InventoryReaderPort = {
  getAvailableQuantities: (variantIds) => getAvailableQuantitiesUseCase.execute(variantIds),
};

const listProductsUseCase = new ListProductsUseCase(productRepository, categoryReader);
const getProductBySlugUseCase = new GetProductBySlugUseCase(productRepository, pricingReader, inventoryReader);

/** Exported for cross-module use — see the use-case's own doc comment. */
export const getVariantsForCartUseCase = new GetVariantsForCartUseCase(productRepository);

const productsController = new ProductsController(listProductsUseCase, getProductBySlugUseCase);

export const router = createProductsRouter(productsController);
