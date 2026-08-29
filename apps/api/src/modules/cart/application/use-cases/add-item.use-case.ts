import { ConflictError, NotFoundError } from "../../../../shared/errors";
import type { CartRepositoryPort } from "../ports/cart-repository.port";
import type { InventoryReaderPort } from "../ports/inventory-reader.port";
import type { VariantCatalogPort } from "../ports/variant-catalog.port";

export interface AddItemInput {
  cartId: string;
  variantId: string;
  quantity: number;
}

export class AddItemUseCase {
  constructor(
    private readonly cartRepository: CartRepositoryPort,
    private readonly variantCatalog: VariantCatalogPort,
    private readonly inventoryReader: InventoryReaderPort,
  ) {}

  async execute(input: AddItemInput): Promise<void> {
    const variants = await this.variantCatalog.getVariants([input.variantId]);
    const variant = variants.get(input.variantId);
    if (!variant || !variant.isActive) {
      throw new NotFoundError("Product variant not found");
    }

    const availability = await this.inventoryReader.getAvailableQuantities([input.variantId]);
    const availableQuantity = availability.get(input.variantId) ?? 0;

    const existing = await this.cartRepository.findItemByVariant(input.cartId, input.variantId);
    const newQuantity = (existing?.quantity ?? 0) + input.quantity;

    if (newQuantity > availableQuantity) {
      throw new ConflictError(
        availableQuantity === 0 ? "This item is out of stock" : `Only ${availableQuantity} left in stock`,
      );
    }

    if (existing) {
      await this.cartRepository.setItemQuantity(existing.id, newQuantity);
    } else {
      await this.cartRepository.addItem(input.cartId, input.variantId, input.quantity);
    }
  }
}
