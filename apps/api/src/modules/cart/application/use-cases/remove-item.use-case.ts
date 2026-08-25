import { NotFoundError } from "../../../../shared/errors";
import type { CartRepositoryPort } from "../ports/cart-repository.port";

export interface RemoveItemInput {
  cartId: string;
  itemId: string;
}

export class RemoveItemUseCase {
  constructor(private readonly cartRepository: CartRepositoryPort) {}

  async execute(input: RemoveItemInput): Promise<void> {
    // Ownership check: itemId must belong to the caller's own cart — without
    // this, an item id guessed/leaked from another cart could be deleted by
    // anyone who sends it.
    const item = await this.cartRepository.findItem(input.cartId, input.itemId);
    if (!item) {
      throw new NotFoundError("Cart item not found");
    }
    await this.cartRepository.removeItem(item.id);
  }
}
