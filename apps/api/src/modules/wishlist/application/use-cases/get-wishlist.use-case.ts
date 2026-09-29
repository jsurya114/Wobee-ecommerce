import type { ProductCatalogPort } from "../ports/product-catalog.port";
import type { InventoryReaderPort } from "../ports/inventory-reader.port";
import type { VariantCatalogPort } from "../ports/variant-catalog.port";
import type { WishlistRepositoryPort } from "../ports/wishlist-repository.port";

export interface WishlistLineView {
  itemId: string;
  productId: string;
  productSlug: string;
  productName: string;
  image: string | null;
  variantId: string | null;
  color: string | null;
  size: string | null;
  /** Display cache (ADR-012) — see WishlistProductDetail's own doc comment. */
  pricePaise: number;
  isProductActive: boolean;
  /** Null when the item has no variantId chosen — variant status isn't known/relevant until one is. */
  isVariantActive: boolean | null;
  /** Null for the same reason as isVariantActive. */
  availableQuantity: number | null;
  /**
   * Whether this line is currently addable to cart as-is. A no-variant item
   * is "available" while the product is active and at least one of its
   * variants has stock (2026-09-30; before that, only while active) — the
   * shopper still picks the size on the PDP, where move-to-cart's own live
   * check applies. A variant item needs the product AND variant active AND
   * real stock.
   */
  isAvailable: boolean;
  /**
   * 2026-09-30 — the product (or, for a line with a chosen size, that
   * variant) is active but has no live stock. The storefront no longer lists
   * such a product anywhere else, but a wishlisted one stays here, shown as
   * SOLD OUT, with nothing to add to the bag. A deactivated product/variant
   * is "no longer available", not sold out.
   */
  isSoldOut: boolean;
  addedAt: string;
}

export interface WishlistView {
  items: WishlistLineView[];
  itemCount: number;
}

/**
 * Handles inactive/out-of-stock products without crashing (week2 (1).md
 * §5's own requirement): a wishlisted product that later goes inactive, or
 * a variant that sells out, still appears in the view — flagged via
 * isProductActive/isVariantActive/isAvailable rather than being silently
 * dropped, so the shopper can see what happened to it (contrast with
 * GetCartUseCase, which drops a hard-deleted variant entirely — wishlist
 * items reference Product/ProductVariant with onDelete: Cascade, so a
 * dangling id here would mean the product row itself is gone, same
 * defensive drop as cart for that one case).
 */
export class GetWishlistUseCase {
  constructor(
    private readonly wishlistRepository: WishlistRepositoryPort,
    private readonly productCatalog: ProductCatalogPort,
    private readonly variantCatalog: VariantCatalogPort,
    private readonly inventoryReader: InventoryReaderPort,
  ) {}

  async execute(userId: string): Promise<WishlistView> {
    const wishlistId = await this.wishlistRepository.findOrCreateWishlistId(userId);
    const items = await this.wishlistRepository.findItems(wishlistId);
    if (items.length === 0) {
      return { items: [], itemCount: 0 };
    }

    const productIds = [...new Set(items.map((item) => item.productId))];
    const variantIds = items
      .map((item) => item.variantId)
      .filter((id): id is string => id !== null);

    const [products, variants, availability, inStockProductIds] = await Promise.all([
      this.productCatalog.getProducts(productIds),
      variantIds.length > 0 ? this.variantCatalog.getVariants(variantIds) : Promise.resolve(new Map<string, never>()),
      variantIds.length > 0 ? this.inventoryReader.getAvailableQuantities(variantIds) : Promise.resolve(new Map<string, number>()),
      this.inventoryReader.findInStockProductIds(),
    ]);

    const lines: WishlistLineView[] = items
      .map((item) => {
        const product = products.get(item.productId);
        // A hard-deleted product (shouldn't happen — products are
        // soft-deleted via isActive, not removed) is dropped, same
        // defensive rule GetCartUseCase applies to a missing variant.
        if (!product) return null;

        const variant = item.variantId ? variants.get(item.variantId) : undefined;
        const availableQuantity = item.variantId ? (availability.get(item.variantId) ?? 0) : null;
        const isSoldOut = item.variantId
          ? product.isActive && Boolean(variant?.isActive) && (availableQuantity ?? 0) === 0
          : product.isActive && !inStockProductIds.has(product.id);
        const isAvailable = item.variantId
          ? product.isActive && Boolean(variant?.isActive) && (availableQuantity ?? 0) > 0
          : product.isActive && !isSoldOut;

        const line: WishlistLineView = {
          itemId: item.id,
          productId: product.id,
          productSlug: product.slug,
          productName: product.name,
          image: product.image,
          variantId: item.variantId,
          color: variant?.color ?? null,
          size: variant?.size ?? null,
          pricePaise: product.minPricePaiseCache,
          isProductActive: product.isActive,
          isVariantActive: item.variantId ? Boolean(variant?.isActive) : null,
          availableQuantity,
          isAvailable,
          isSoldOut,
          addedAt: item.createdAt.toISOString(),
        };
        return line;
      })
      .filter((line): line is WishlistLineView => line !== null);

    return { items: lines, itemCount: lines.length };
  }
}
