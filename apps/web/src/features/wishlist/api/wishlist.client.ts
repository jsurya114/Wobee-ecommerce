import { apiFetch } from "@/lib/api-client";

export interface WishlistLine {
  itemId: string;
  productId: string;
  productSlug: string;
  productName: string;
  image: string | null;
  variantId: string | null;
  color: string | null;
  size: string | null;
  pricePaise: number;
  isProductActive: boolean;
  isVariantActive: boolean | null;
  availableQuantity: number | null;
  isAvailable: boolean;
  addedAt: string;
}

export interface WishlistView {
  items: WishlistLine[];
  itemCount: number;
}

export interface WishlistItem {
  id: string;
  productId: string;
  variantId: string | null;
  createdAt: string;
}

/** Every wishlist endpoint requires a real login (no guest wishlist) — accessToken is required, not optional like cart's. */
export function getWishlist(accessToken: string): Promise<WishlistView> {
  return apiFetch<WishlistView>("/api/v1/wishlist", { accessToken });
}

export function addWishlistItem(input: { productId: string; variantId?: string }, accessToken: string): Promise<{ item: WishlistItem }> {
  return apiFetch<{ item: WishlistItem }>("/api/v1/wishlist/items", { method: "POST", body: input, accessToken });
}

export function removeWishlistItem(itemId: string, accessToken: string): Promise<void> {
  return apiFetch<void>(`/api/v1/wishlist/items/${encodeURIComponent(itemId)}`, { method: "DELETE", accessToken });
}

export function moveWishlistItemToCart(itemId: string, quantity: number, accessToken: string): Promise<{ cartId: string }> {
  return apiFetch<{ cartId: string }>(`/api/v1/wishlist/items/${encodeURIComponent(itemId)}/move-to-cart`, {
    method: "POST",
    body: { quantity },
    accessToken,
  });
}
