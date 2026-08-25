/** Narrow port for this module's dependency on `cart` — marks the cart CONVERTED inside the same checkout transaction the order is created in (see TransactionPort). */
export interface CartWriterPort {
  markConverted(cartId: string, tx: unknown): Promise<void>;
}
