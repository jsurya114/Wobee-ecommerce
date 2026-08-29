import { resolveMergedQuantity } from "../../domain/resolve-merged-quantity";
import type { CartRepositoryPort } from "../ports/cart-repository.port";
import type { InventoryReaderPort } from "../ports/inventory-reader.port";
import { GetOrCreateCartUseCase } from "./get-or-create-cart.use-case";

export interface MergeGuestCartInput {
  userId: string;
  guestCartId: string | undefined;
}

/**
 * ADR-011: on login, the guest cart_id cookie's cart merges into the
 * user's existing cart — union items, prefer the HIGHER quantity per
 * variant on conflict — and the merged result is re-validated against live
 * stock before being shown, because a guest cart + account cart combined
 * can exceed available quantity for a low-stock variant. Called explicitly
 * by the frontend right after login/register succeeds (not from inside the
 * auth module itself — merging carts is a cart-module concern, keeping
 * auth from depending on cart, ADR-010's direction of dependency).
 */
export class MergeGuestCartUseCase {
  constructor(
    private readonly cartRepository: CartRepositoryPort,
    private readonly inventoryReader: InventoryReaderPort,
    private readonly getOrCreateCartUseCase: GetOrCreateCartUseCase,
  ) {}

  async execute(input: MergeGuestCartInput): Promise<{ cartId: string }> {
    const { cartId: userCartId } = await this.getOrCreateCartUseCase.execute({ userId: input.userId });

    if (!input.guestCartId) {
      return { cartId: userCartId };
    }

    const guestCart = await this.cartRepository.findActiveCartById(input.guestCartId);
    if (!guestCart || guestCart.userId !== null || guestCart.id === userCartId) {
      return { cartId: userCartId };
    }

    const guestItems = await this.cartRepository.findItems(guestCart.id);
    for (const guestItem of guestItems) {
      const existing = await this.cartRepository.findItemByVariant(userCartId, guestItem.variantId);
      if (existing) {
        await this.cartRepository.setItemQuantity(
          existing.id,
          resolveMergedQuantity(existing.quantity, guestItem.quantity),
        );
      } else {
        await this.cartRepository.addItem(userCartId, guestItem.variantId, guestItem.quantity);
      }
    }

    await this.cartRepository.markCartMerged(guestCart.id);

    await this.revalidateAgainstLiveStock(userCartId);

    return { cartId: userCartId };
  }

  /** Caps each merged line to currently-available stock, dropping any that are now fully out of stock. */
  private async revalidateAgainstLiveStock(cartId: string): Promise<void> {
    const items = await this.cartRepository.findItems(cartId);
    if (items.length === 0) return;

    const availability = await this.inventoryReader.getAvailableQuantities(items.map((item) => item.variantId));

    for (const item of items) {
      const availableQuantity = availability.get(item.variantId) ?? 0;
      if (availableQuantity <= 0) {
        await this.cartRepository.removeItem(item.id);
      } else if (item.quantity > availableQuantity) {
        await this.cartRepository.setItemQuantity(item.id, availableQuantity);
      }
    }
  }
}
