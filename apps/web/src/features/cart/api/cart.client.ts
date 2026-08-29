import { apiFetch } from "@/lib/api-client";

export interface CartLine {
  itemId: string;
  variantId: string;
  productSlug: string;
  productName: string;
  image: string | null;
  sku: string;
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

/** ADR-021 checkout-blocking + free-delivery progress, server-computed (Week 1 Day 4). */
export interface ShippingProgress {
  meetsMinimum: boolean;
  isFreeDelivery: boolean;
  shippingFeePaise: number;
  gramsToMinimum: number;
  gramsToFreeDelivery: number;
}

export interface AppliedCoupon {
  code: string;
  /** false when the applied code no longer validates (expired, cart dropped below its minimum, etc.) — shown with `reason` rather than silently vanishing. */
  isValid: boolean;
  reason?: string;
}

export interface CartView {
  cartId: string;
  items: CartLine[];
  itemCount: number;
  totalWeightGrams: number;
  totalPaise: number;
  /** Week 2 Day 5 (week2 (1).md §9) — 0 when no coupon is applied or the applied one no longer validates. */
  discountPaise: number;
  appliedCoupon: AppliedCoupon | null;
  shipping: ShippingProgress;
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

/** Week 2 Day 5 (week2 (1).md §9) — requires a logged-in accessToken (coupons need a real account, see Cart.couponCode's own schema comment). */
export function applyCoupon(code: string, accessToken: string): Promise<CartView> {
  return apiFetch<CartView>("/api/v1/cart/coupon", { method: "POST", body: { code }, accessToken });
}

export function removeCoupon(accessToken: string): Promise<CartView> {
  return apiFetch<CartView>("/api/v1/cart/coupon", { method: "DELETE", accessToken });
}
