/** Narrow port onto `orders` — the verified-purchase check (week2 (1).md §8), see HasPurchasedProductUseCase's own doc comment for the exact status rule. */
export interface PurchaseCheckerPort {
  hasPurchased(userId: string, productId: string): Promise<boolean>;
}
