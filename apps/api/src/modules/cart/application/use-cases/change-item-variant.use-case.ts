import { ConflictError, NotFoundError, ValidationError } from "../../../../shared/errors";
import type { CartRepositoryPort } from "../ports/cart-repository.port";
import type { InventoryReaderPort } from "../ports/inventory-reader.port";
import type { VariantCatalogPort } from "../ports/variant-catalog.port";

export interface ChangeItemVariantInput {
  cartId: string;
  itemId: string;
  variantId: string;
}

/**
 * Cart "change size" — re-points an existing line at a different variant of
 * the SAME product rather than sending the shopper back to the PDP. Stock
 * is revalidated against the target variant (not assumed from whatever the
 * size-selector popover last fetched), and if another line in this cart
 * already holds that variant, the two merge into one line rather than
 * leaving two rows for the same logical product+variant.
 */
export class ChangeItemVariantUseCase {
  constructor(
    private readonly cartRepository: CartRepositoryPort,
    private readonly variantCatalog: VariantCatalogPort,
    private readonly inventoryReader: InventoryReaderPort,
  ) {}

  async execute(input: ChangeItemVariantInput): Promise<void> {
    const item = await this.cartRepository.findItem(input.cartId, input.itemId);
    if (!item) {
      throw new NotFoundError("Cart item not found");
    }

    if (item.variantId === input.variantId) {
      return;
    }

    const variants = await this.variantCatalog.getVariants([item.variantId, input.variantId]);
    const currentVariant = variants.get(item.variantId);
    const targetVariant = variants.get(input.variantId);

    if (!targetVariant || !targetVariant.isActive) {
      throw new NotFoundError("Selected size is no longer available");
    }
    if (!currentVariant || currentVariant.productId !== targetVariant.productId) {
      throw new ValidationError("That size does not belong to this product");
    }

    const availability = await this.inventoryReader.getAvailableQuantities([input.variantId]);
    const availableQuantity = availability.get(input.variantId) ?? 0;
    if (availableQuantity <= 0) {
      throw new ConflictError("That size is out of stock");
    }

    const nextQuantity = Math.min(item.quantity, availableQuantity);
    const existingTargetItem = await this.cartRepository.findItemByVariant(input.cartId, input.variantId);

    if (existingTargetItem) {
      const mergedQuantity = Math.min(existingTargetItem.quantity + item.quantity, availableQuantity);
      await this.cartRepository.setItemQuantity(existingTargetItem.id, mergedQuantity);
      await this.cartRepository.removeItem(item.id);
      return;
    }

    await this.cartRepository.setItemVariant(item.id, input.variantId);
    if (nextQuantity !== item.quantity) {
      await this.cartRepository.setItemQuantity(item.id, nextQuantity);
    }
  }
}
