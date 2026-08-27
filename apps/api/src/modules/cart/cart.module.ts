// Composition root for the cart module (ARCHITECTURE.md §3.2) — wires
// repos to use-cases to routes, and wires this module's own ports to other
// modules' exported use-cases (products, pricing, inventory, shipping) as
// trivial pass-through adapters, keeping the dependency-cruiser boundary
// intact.
import { getAvailableQuantitiesUseCase } from "../inventory/inventory.module";
import { calculateEffectivePriceUseCase } from "../pricing/pricing.module";
import { getVariantsForCartUseCase } from "../products/products.module";
import { evaluateShippingUseCase } from "../shipping/shipping.module";
import type { InventoryReaderPort } from "./application/ports/inventory-reader.port";
import type { PricingReaderPort } from "./application/ports/pricing-reader.port";
import type { ShippingReaderPort } from "./application/ports/shipping-reader.port";
import type { VariantCatalogPort } from "./application/ports/variant-catalog.port";
import { AddItemUseCase } from "./application/use-cases/add-item.use-case";
import { GetCartUseCase } from "./application/use-cases/get-cart.use-case";
import { GetOrCreateCartUseCase } from "./application/use-cases/get-or-create-cart.use-case";
import { MarkCartConvertedUseCase } from "./application/use-cases/mark-cart-converted.use-case";
import { MergeGuestCartUseCase } from "./application/use-cases/merge-guest-cart.use-case";
import { RemoveItemUseCase } from "./application/use-cases/remove-item.use-case";
import { UpdateItemQuantityUseCase } from "./application/use-cases/update-item-quantity.use-case";
import { CartRepository } from "./infrastructure/repositories/cart.repository";
import { CartController } from "./interface/http/cart.controller";
import { createCartRouter } from "./interface/http/cart.routes";

const cartRepository = new CartRepository();

const variantCatalog: VariantCatalogPort = { getVariants: (ids) => getVariantsForCartUseCase.execute(ids) };
const pricingReader: PricingReaderPort = { calculateMany: (inputs) => calculateEffectivePriceUseCase.executeMany(inputs) };
const inventoryReader: InventoryReaderPort = {
  getAvailableQuantities: (variantIds) => getAvailableQuantitiesUseCase.execute(variantIds),
};
const shippingReader: ShippingReaderPort = { evaluate: (grams) => evaluateShippingUseCase.execute(grams) };

/** Exported for cross-module use — orders' checkout resolves the caller's cart the same way cart's own controller does. */
export const getOrCreateCartUseCase = new GetOrCreateCartUseCase(cartRepository);
/** Exported for cross-module use — orders' checkout reads live weight/price/stock through the same path the cart page does. */
export const getCartUseCase = new GetCartUseCase(cartRepository, variantCatalog, pricingReader, inventoryReader, shippingReader);
/** Exported for cross-module use — wishlist's move-to-cart action (Week 2 Day 2) adds through the same path the cart page's "Add to bag" does. */
export const addItemUseCase = new AddItemUseCase(cartRepository, variantCatalog, inventoryReader);
const updateItemQuantityUseCase = new UpdateItemQuantityUseCase(cartRepository, inventoryReader);
const removeItemUseCase = new RemoveItemUseCase(cartRepository);
const mergeGuestCartUseCase = new MergeGuestCartUseCase(cartRepository, inventoryReader, getOrCreateCartUseCase);
/** Exported for cross-module use — see the use-case's own doc comment. */
export const markCartConvertedUseCase = new MarkCartConvertedUseCase(cartRepository);

const cartController = new CartController(
  getOrCreateCartUseCase,
  getCartUseCase,
  addItemUseCase,
  updateItemQuantityUseCase,
  removeItemUseCase,
  mergeGuestCartUseCase,
);

export const router = createCartRouter(cartController);
