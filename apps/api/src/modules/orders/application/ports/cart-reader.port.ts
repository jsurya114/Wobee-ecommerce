export interface CheckoutCartLine {
  itemId: string;
  variantId: string;
  /** Week 2 Day 5 (week2 (1).md §9) — coupon product/category-applicability matching. */
  productId: string;
  categoryId: string;
  productName: string;
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

export interface CheckoutCartView {
  cartId: string;
  items: CheckoutCartLine[];
  totalWeightGrams: number;
  totalPaise: number;
  /** The applied coupon's code, if any — checkout re-validates and redeems it live through `coupons` (RedeemCouponUseCase), never trusting whatever the cart page's own preview last showed. */
  couponCode: string | null;
}

/**
 * Narrow port for this module's dependency on `cart` — checkout reads live
 * weight/price/stock through the exact same recalculation path the cart
 * page itself renders (GetCartUseCase), so "what checkout charges" and
 * "what the cart page showed a second ago" can never silently disagree.
 */
export interface CartReaderPort {
  getCart(cartId: string, userId: string | undefined): Promise<CheckoutCartView>;
}
