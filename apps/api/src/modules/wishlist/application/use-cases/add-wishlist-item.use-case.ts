import { ValidationError } from "../../../../shared/errors";
import type { WishlistItemEntity } from "../../domain/entities/wishlist-item.entity";
import type { VariantCatalogPort } from "../ports/variant-catalog.port";
import type { WishlistRepositoryPort } from "../ports/wishlist-repository.port";

export interface AddWishlistItemCommand {
  userId: string;
  productId: string;
  variantId?: string;
}

/**
 * Duplicate prevention (week2 (1).md §5): WishlistItem's own
 * @@unique([wishlistId, productId]) constraint is the real guard (schema
 * already enforces "a product appears at most once per wishlist" —
 * intentionally not reinvented here); the repository maps its violation to
 * a clean ConflictError (409), never a raw 500 from the DB constraint —
 * see WishlistRepository.addItem's own comment.
 */
export class AddWishlistItemUseCase {
  constructor(
    private readonly wishlistRepository: WishlistRepositoryPort,
    private readonly variantCatalog: VariantCatalogPort,
  ) {}

  async execute(command: AddWishlistItemCommand): Promise<WishlistItemEntity> {
    if (command.variantId) {
      const variants = await this.variantCatalog.getVariants([command.variantId]);
      const variant = variants.get(command.variantId);
      if (!variant || variant.productId !== command.productId) {
        throw new ValidationError("This variant does not belong to the given product");
      }
    }

    const wishlistId = await this.wishlistRepository.findOrCreateWishlistId(command.userId);
    return this.wishlistRepository.addItem(wishlistId, command.productId, command.variantId ?? null);
  }
}
