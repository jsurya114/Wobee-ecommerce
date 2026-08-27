export interface WishlistProductDetail {
  id: string;
  slug: string;
  name: string;
  image: string | null;
  isActive: boolean;
  /** Display cache (ADR-012) — the wishlist view is a listing context, same rule products' own listing uses, never checkout. */
  minPricePaiseCache: number;
}

/**
 * Narrow port for this module's one dependency on `products` — decouples
 * wishlist's application layer from products' concrete use-case class
 * (DIP); the composition root wires it with a one-line pass-through
 * adapter, same pattern cart's VariantCatalogPort uses. Deliberately NOT
 * filtered to active-only products — see GetProductsByIdsUseCase's own
 * doc comment on why a wishlisted-then-deactivated product must still
 * resolve (with isActive: false) instead of disappearing.
 */
export interface ProductCatalogPort {
  getProducts(productIds: string[]): Promise<Map<string, WishlistProductDetail>>;
}
