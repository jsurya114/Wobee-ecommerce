import { apiFetch } from "@/lib/api-client";

export interface CartLine {
  itemId: string;
  variantId: string;
  productSlug: string;
  productName: string;
  image: string | null;
  color: string;
  size: string;
  weightGrams: number;
  ratePerKgPaise: number;
  unitPricePaise: number;
  quantity: number;
  subtotalPaise: number;
  availableQuantity: number;
  isAvailable: boolean;
}

export interface CartView {
  cartId: string;
  items: CartLine[];
  itemCount: number;
  totalWeightGrams: number;
  totalPaise: number;
}

/** Guest identity travels via the signed httpOnly cart_id cookie (ADR-011) — apiFetch always sends credentials, nothing else to pass here. */
export function getCart(accessToken?: string): Promise<CartView> {
  return apiFetch<CartView>("/api/v1/cart", { accessToken });
}

export function addCartItem(input: { variantId: string; quantity: number }, accessToken?: string): Promise<CartView> {
  return apiFetch<CartView>("/api/v1/cart/items", { method: "POST", body: input, accessToken });
}

export function updateCartItem(itemId: string, quantity: number, accessToken?: string): Promise<CartView> {
  return apiFetch<CartView>(`/api/v1/cart/items/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    body: { quantity },
    accessToken,
  });
}

export function removeCartItem(itemId: string, accessToken?: string): Promise<CartView> {
  return apiFetch<CartView>(`/api/v1/cart/items/${encodeURIComponent(itemId)}`, { method: "DELETE", accessToken });
}

/** ADR-011: merges the guest cart_id cookie's cart into the caller's account cart. Requires a logged-in accessToken. */
export function mergeCart(accessToken: string): Promise<CartView> {
  return apiFetch<CartView>("/api/v1/cart/merge", { method: "POST", accessToken });
}
