import { NotFoundError, UnprocessableEntityError } from "../../../../shared/errors";
import type { CartWriterPort } from "../ports/cart-writer.port";
import type { InventoryReaderPort } from "../ports/inventory-reader.port";
import type { VariantCatalogPort } from "../ports/variant-catalog.port";
import type { WishlistRepositoryPort } from "../ports/wishlist-repository.port";

export interface MoveWishlistItemToCartCommand {
  userId: string;
  itemId: string;
  quantity: number;
}

export interface MoveWishlistItemToCartResult {
  cartId: string;
}

/**
 * "Move/add to cart" (week2 (1).md §5) — interpreted as MOVE (adds to cart,
 * then removes the wishlist item), the more common wishlist convention and
 * the narrower of the two readings the plan's "where approved" phrasing
 * left open; a separate non-removing "add" action wasn't built since
 * nothing in the plan or its own test list distinguishes the two. Flagging
 * this as a documented interpretation, not a rubber-stamped requirement.
 *
 * Server-authoritative availability (DEVELOPMENT_RULES.md #1, week2 (1).md
 * §5): re-checks live stock here even though GetWishlistUseCase's view
 * already carries an isAvailable flag — that flag can be stale by the time
 * the shopper clicks "move to cart" (another shopper bought the last one in
 * between), so this is the actual gate, not the display flag.
 */
export class MoveWishlistItemToCartUseCase {
  constructor(
    private readonly wishlistRepository: WishlistRepositoryPort,
    private readonly variantCatalog: VariantCatalogPort,
    private readonly inventoryReader: InventoryReaderPort,
    private readonly cartWriter: CartWriterPort,
  ) {}

  async execute(command: MoveWishlistItemToCartCommand): Promise<MoveWishlistItemToCartResult> {
    const wishlistId = await this.wishlistRepository.findOrCreateWishlistId(command.userId);
    const item = await this.wishlistRepository.findItemById(wishlistId, command.itemId);
    if (!item) {
      throw new NotFoundError("Wishlist item not found");
    }
    if (!item.variantId) {
      throw new UnprocessableEntityError("Choose a size before adding this item to your bag");
    }

    const [variants, availability] = await Promise.all([
      this.variantCatalog.getVariants([item.variantId]),
      this.inventoryReader.getAvailableQuantities([item.variantId]),
    ]);
    const variant = variants.get(item.variantId);
    const availableQuantity = availability.get(item.variantId) ?? 0;
    if (!variant || !variant.isActive || availableQuantity < command.quantity) {
      throw new UnprocessableEntityError("This item is currently unavailable");
    }

    const cartId = await this.cartWriter.getOrCreateCartId(command.userId);
    await this.cartWriter.addItem(cartId, item.variantId, command.quantity);
    await this.wishlistRepository.removeItem(wishlistId, command.itemId);

    return { cartId };
  }
}
