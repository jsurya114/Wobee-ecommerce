// Composition root for the wishlist module (ARCHITECTURE.md §3.2) — wires
// its own repo to its own use-cases to routes, and wires this module's
// ports to other modules' exported use-cases (products, inventory, cart) as
// trivial pass-through adapters, exactly the shape cart.module.ts /
// products.module.ts already use. Owns (ADR-010): Wishlist, WishlistItem.
//
// Week 2 Day 2 (week2 (1).md §5) build-out of the Week 1 placeholder — was
// a bare `Router()`, no routes. Auth required on every route (no guest
// wishlist — Wishlist.userId is non-null/unique).
import { addItemUseCase, getOrCreateCartUseCase } from "../cart/cart.module";
import { getAvailableQuantitiesUseCase } from "../inventory/inventory.module";
import { getProductsByIdsUseCase, getVariantsForCartUseCase } from "../products/products.module";
import type { CartWriterPort } from "./application/ports/cart-writer.port";
import type { InventoryReaderPort } from "./application/ports/inventory-reader.port";
import type { ProductCatalogPort, WishlistProductDetail } from "./application/ports/product-catalog.port";
import type { VariantCatalogPort, WishlistVariantDetail } from "./application/ports/variant-catalog.port";
import { AddWishlistItemUseCase } from "./application/use-cases/add-wishlist-item.use-case";
import { CheckWishlistStateUseCase } from "./application/use-cases/check-wishlist-state.use-case";
import { GetWishlistUseCase } from "./application/use-cases/get-wishlist.use-case";
import { MoveWishlistItemToCartUseCase } from "./application/use-cases/move-wishlist-item-to-cart.use-case";
import { RemoveWishlistItemUseCase } from "./application/use-cases/remove-wishlist-item.use-case";
import { WishlistRepository } from "./infrastructure/repositories/wishlist.repository";
import { WishlistController } from "./interface/http/wishlist.controller";
import { createWishlistRouter } from "./interface/http/wishlist.routes";

const wishlistRepository = new WishlistRepository();

// ProductSummaryWithStatus (products') carries `primaryImage: {url,...} | null`
// rather than a flat `image` field — mapped explicitly, same invariant-Map
// reasoning as variantCatalog below.
const productCatalog: ProductCatalogPort = {
  getProducts: async (productIds) => {
    const details = await getProductsByIdsUseCase.execute(productIds);
    const mapped = new Map<string, WishlistProductDetail>();
    for (const [id, detail] of details) {
      mapped.set(id, {
        id: detail.id,
        slug: detail.slug,
        name: detail.name,
        image: detail.primaryImage?.url ?? null,
        isActive: detail.isActive,
        minPricePaiseCache: detail.minPricePaiseCache,
      });
    }
    return mapped;
  },
};

// CartVariantDetail (products') is a strict superset of WishlistVariantDetail's
// fields — mapped explicitly rather than relied on structurally, since
// Map<string, V> is invariant in V.
const variantCatalog: VariantCatalogPort = {
  getVariants: async (variantIds) => {
    const details = await getVariantsForCartUseCase.execute(variantIds);
    const mapped = new Map<string, WishlistVariantDetail>();
    for (const [id, detail] of details) {
      mapped.set(id, {
        id: detail.id,
        productId: detail.productId,
        sku: detail.sku,
        color: detail.color,
        size: detail.size,
        weightGrams: detail.weightGrams,
        isActive: detail.isActive,
      });
    }
    return mapped;
  },
};

const inventoryReader: InventoryReaderPort = {
  getAvailableQuantities: (variantIds) => getAvailableQuantitiesUseCase.execute(variantIds),
};

const cartWriter: CartWriterPort = {
  getOrCreateCartId: async (userId) => (await getOrCreateCartUseCase.execute({ userId })).cartId,
  addItem: (cartId, variantId, quantity) => addItemUseCase.execute({ cartId, variantId, quantity }),
};

const getWishlistUseCase = new GetWishlistUseCase(wishlistRepository, productCatalog, variantCatalog, inventoryReader);
const addWishlistItemUseCase = new AddWishlistItemUseCase(wishlistRepository, variantCatalog);
const removeWishlistItemUseCase = new RemoveWishlistItemUseCase(wishlistRepository);
const checkWishlistStateUseCase = new CheckWishlistStateUseCase(wishlistRepository);
const moveWishlistItemToCartUseCase = new MoveWishlistItemToCartUseCase(wishlistRepository, variantCatalog, inventoryReader, cartWriter);

const wishlistController = new WishlistController(
  getWishlistUseCase,
  addWishlistItemUseCase,
  removeWishlistItemUseCase,
  checkWishlistStateUseCase,
  moveWishlistItemToCartUseCase,
);

export const router = createWishlistRouter(wishlistController);
