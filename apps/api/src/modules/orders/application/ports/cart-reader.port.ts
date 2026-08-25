export interface CheckoutCartLine {
  itemId: string;
  variantId: string;
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
}

/**
 * Narrow port for this module's dependency on `cart` — checkout reads live
 * weight/price/stock through the exact same recalculation path the cart
 * page itself renders (GetCartUseCase), so "what checkout charges" and
 * "what the cart page showed a second ago" can never silently disagree.
 */
export interface CartReaderPort {
  getCart(cartId: string): Promise<CheckoutCartView>;
}
