import { ConflictError, NotFoundError } from "../../../../shared/errors";
import type { CartRepositoryPort } from "../ports/cart-repository.port";
import type { InventoryReaderPort } from "../ports/inventory-reader.port";

export interface UpdateItemQuantityInput {
  cartId: string;
  itemId: string;
  quantity: number;
}

export class UpdateItemQuantityUseCase {
  constructor(
    private readonly cartRepository: CartRepositoryPort,
    private readonly inventoryReader: InventoryReaderPort,
  ) {}

  async execute(input: UpdateItemQuantityInput): Promise<void> {
    const item = await this.cartRepository.findItem(input.cartId, input.itemId);
    if (!item) {
      throw new NotFoundError("Cart item not found");
    }

    const availability = await this.inventoryReader.getAvailableQuantities([item.variantId]);
    const availableQuantity = availability.get(item.variantId) ?? 0;
    if (input.quantity > availableQuantity) {
      throw new ConflictError(
        availableQuantity === 0 ? "This item is out of stock" : `Only ${availableQuantity} left in stock`,
      );
    }

    await this.cartRepository.setItemQuantity(item.id, input.quantity);
  }
}
