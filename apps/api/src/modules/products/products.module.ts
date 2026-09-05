// Composition root for the products module (ARCHITECTURE.md §3.2) — wires
// repos/services to use-cases to routes, and wires this module's own ports
// to other modules' exported use-cases (categories, pricing, inventory) as
// trivial pass-through adapters, keeping the dependency-cruiser boundary
// intact (no Prisma import outside infrastructure/). Week 2 Day 7
// (week2 (1).md §16) adds the admin product/variant/media management
// use-cases below the original customer-facing ones, exported for `admin`'s
// HTTP layer the same way every other admin-facing module already does.
import { findCategoryBySlugUseCase } from "../categories/categories.module";
import { findCollectionBySlugUseCase } from "../collections/collections.module";
import { findInStockVariantIdsUseCase, getAvailableQuantitiesUseCase, initializeInventoryForVariantUseCase } from "../inventory/inventory.module";
import { calculateEffectivePriceUseCase } from "../pricing/pricing.module";
import { env } from "../../config/env";
import type { CategoryReaderPort } from "./application/ports/category-reader.port";
import type { CollectionReaderPort } from "./application/ports/collection-reader.port";
import type { InventoryInitializerPort } from "./application/ports/inventory-initializer.port";
import type { InventoryReaderPort } from "./application/ports/inventory-reader.port";
import type { PricingReaderPort } from "./application/ports/pricing-reader.port";
import type { ProductRepositoryPort } from "./application/ports/product-repository.port";
import { AddProductImageUseCase } from "./application/use-cases/admin/add-product-image.use-case";
import { CreateProductUseCase } from "./application/use-cases/admin/create-product.use-case";
import { CreateProductVariantUseCase } from "./application/use-cases/admin/create-product-variant.use-case";
import { GetProductAdminUseCase } from "./application/use-cases/admin/get-product-admin.use-case";
import { ListProductsAdminUseCase } from "./application/use-cases/admin/list-products-admin.use-case";
import { RemoveProductImageUseCase } from "./application/use-cases/admin/remove-product-image.use-case";
import { ReorderProductImagesUseCase } from "./application/use-cases/admin/reorder-product-images.use-case";
import { SetProductActiveUseCase } from "./application/use-cases/admin/set-product-active.use-case";
import { SetProductVariantActiveUseCase } from "./application/use-cases/admin/set-product-variant-active.use-case";
import { UpdateProductUseCase } from "./application/use-cases/admin/update-product.use-case";
import { UpdateProductVariantUseCase } from "./application/use-cases/admin/update-product-variant.use-case";
import { GetCategoryImagesUseCase } from "./application/use-cases/get-category-images.use-case";
import { GetProductBySlugUseCase } from "./application/use-cases/get-product-by-slug.use-case";
import { GetProductsByIdsUseCase } from "./application/use-cases/get-products-by-ids.use-case";
import { GetRelatedProductsUseCase } from "./application/use-cases/get-related-products.use-case";
import { GetVariantsForCartUseCase } from "./application/use-cases/get-variants-for-cart.use-case";
import { ListProductsUseCase } from "./application/use-cases/list-products.use-case";
import { ResolveProductIdsForVariantsUseCase } from "./application/use-cases/resolve-product-ids-for-variants.use-case";
import { SearchProductSuggestionsUseCase } from "./application/use-cases/search-product-suggestions.use-case";
import { CachedProductRepository } from "./infrastructure/repositories/cached-product-repository";
import { ProductRepository } from "./infrastructure/repositories/product.repository";
import { ProductsController } from "./interface/http/products.controller";
import { createProductsRouter } from "./interface/http/products.routes";

// ADR-017 (Caching Strategy): wraps every customer-facing read this module
// exposes in a Redis read-through cache — see CachedProductRepository's own
// doc comment for exactly what's cached vs. always-live, and for why every
// admin method still passes straight through underneath, uncached. Skipped
// entirely under `pnpm test` — every *.integration.test.ts here seeds
// fixtures via raw Prisma writes that bypass this decorator's own
// invalidation, then asserts on an immediate GET of the same resource; a
// live cache in that path would break those tests deterministically, not
// flakily. The cache helper's own hit/miss/error-fallback/version-bump
// behavior is verified directly by catalog-cache.test.ts instead.
const realProductRepository = new ProductRepository();
const productRepository: ProductRepositoryPort =
  env.NODE_ENV === "test" ? realProductRepository : new CachedProductRepository(realProductRepository);

const categoryReader: CategoryReaderPort = { findIdBySlug: (slug) => findCategoryBySlugUseCase.execute(slug) };
const collectionReader: CollectionReaderPort = { findIdBySlug: (slug) => findCollectionBySlugUseCase.execute(slug) };
const pricingReader: PricingReaderPort = { calculateMany: (inputs) => calculateEffectivePriceUseCase.executeMany(inputs) };
const inventoryReader: InventoryReaderPort = {
  getAvailableQuantities: (variantIds) => getAvailableQuantitiesUseCase.execute(variantIds),
  findInStockVariantIds: () => findInStockVariantIdsUseCase.execute(),
};
const inventoryInitializer: InventoryInitializerPort = {
  initializeForVariant: (variantId, quantity) => initializeInventoryForVariantUseCase.execute(variantId, quantity),
};

const getProductBySlugUseCase = new GetProductBySlugUseCase(productRepository, pricingReader, inventoryReader);
const searchProductSuggestionsUseCase = new SearchProductSuggestionsUseCase(productRepository);
const getRelatedProductsUseCase = new GetRelatedProductsUseCase(productRepository, pricingReader);

/** Exported for cross-module use — `home`'s New Arrivals rail (Week 2 Day 8 Part 2) calls this with `sort: "newest"` instead of duplicating catalogue-listing logic. */
export const listProductsUseCase = new ListProductsUseCase(
  productRepository,
  categoryReader,
  collectionReader,
  inventoryReader,
  pricingReader,
);
/** Exported for cross-module use — see the use-case's own doc comment. */
export const getVariantsForCartUseCase = new GetVariantsForCartUseCase(productRepository);
/** Exported for cross-module use — see the use-case's own doc comment. */
export const getProductsByIdsUseCase = new GetProductsByIdsUseCase(productRepository, pricingReader);
/** Exported for cross-module use — see the use-case's own doc comment. */
export const resolveProductIdsForVariantsUseCase = new ResolveProductIdsForVariantsUseCase(productRepository);
/** Exported for cross-module use (redesign O-3) — `home` composes this into the category-rail payload. */
export const getCategoryImagesUseCase = new GetCategoryImagesUseCase(productRepository);

/** Exported for `admin`'s HTTP layer (ADR-025) — Week 2 Day 7 admin product management. */
export const listProductsAdminUseCase = new ListProductsAdminUseCase(productRepository);
export const getProductAdminUseCase = new GetProductAdminUseCase(productRepository);
export const createProductUseCase = new CreateProductUseCase(productRepository);
export const updateProductUseCase = new UpdateProductUseCase(productRepository);
export const setProductActiveUseCase = new SetProductActiveUseCase(productRepository);
export const createProductVariantUseCase = new CreateProductVariantUseCase(productRepository, pricingReader, inventoryInitializer);
export const updateProductVariantUseCase = new UpdateProductVariantUseCase(productRepository, pricingReader);
export const setProductVariantActiveUseCase = new SetProductVariantActiveUseCase(productRepository);
export const addProductImageUseCase = new AddProductImageUseCase(productRepository);
export const removeProductImageUseCase = new RemoveProductImageUseCase(productRepository);
export const reorderProductImagesUseCase = new ReorderProductImagesUseCase(productRepository);

const productsController = new ProductsController(
  listProductsUseCase,
  getProductBySlugUseCase,
  searchProductSuggestionsUseCase,
  getRelatedProductsUseCase,
);

export const router = createProductsRouter(productsController);
