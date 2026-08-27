export interface WishlistItemEntity {
  id: string;
  productId: string;
  /** Null when the shopper saved "the product" without picking a size/variant — see wishlist.module.ts's own doc comment on how that affects move-to-cart. */
  variantId: string | null;
  createdAt: Date;
}
