// Composition root for the cart module (ARCHITECTURE.md §3.2) — wires
// repos to use-cases to routes, and wires this module's own ports to other
// modules' exported use-cases (products, pricing, inventory) as trivial
// pass-through adapters, keeping the dependency-cruiser boundary intact.
import { getAvailableQuantitiesUseCase } from "../inventory/inventory.module";
import { calculateEffectivePriceUseCase } from "../pricing/pricing.module";
import { getVariantsForCartUseCase } from "../products/products.module";
import type { InventoryReaderPort } from "./application/ports/inventory-reader.port";
import type { PricingReaderPort } from "./application/ports/pricing-reader.port";
import type { VariantCatalogPort } from "./application/ports/variant-catalog.port";
import { AddItemUseCase } from "./application/use-cases/add-item.use-case";
import { GetCartUseCase } from "./application/use-cases/get-cart.use-case";
import { GetOrCreateCartUseCase } from "./application/use-cases/get-or-create-cart.use-case";
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

const getOrCreateCartUseCase = new GetOrCreateCartUseCase(cartRepository);
const getCartUseCase = new GetCartUseCase(cartRepository, variantCatalog, pricingReader, inventoryReader);
const addItemUseCase = new AddItemUseCase(cartRepository, variantCatalog, inventoryReader);
const updateItemQuantityUseCase = new UpdateItemQuantityUseCase(cartRepository, inventoryReader);
const removeItemUseCase = new RemoveItemUseCase(cartRepository);
const mergeGuestCartUseCase = new MergeGuestCartUseCase(cartRepository, inventoryReader, getOrCreateCartUseCase);

const cartController = new CartController(
  getOrCreateCartUseCase,
  getCartUseCase,
  addItemUseCase,
  updateItemQuantityUseCase,
  removeItemUseCase,
  mergeGuestCartUseCase,
);

export const router = createCartRouter(cartController);
