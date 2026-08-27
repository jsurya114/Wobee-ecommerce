/** Narrow port for this module's one dependency on `cart` — move-to-cart adds through the exact same GetOrCreateCartUseCase/AddItemUseCase path the cart page's own "Add to bag" action uses, not a shortcut around it. */
export interface CartWriterPort {
  getOrCreateCartId(userId: string): Promise<string>;
  addItem(cartId: string, variantId: string, quantity: number): Promise<void>;
}
