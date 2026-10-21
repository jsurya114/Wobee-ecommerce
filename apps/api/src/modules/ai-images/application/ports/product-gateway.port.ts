/** Adapter over the products module's exported use-cases. */
export interface ProductGatewayPort {
  /** Returns the product name (used for alt text); throws NotFoundError when missing. */
  getProductName(productId: string): Promise<string>;
  attachImage(productId: string, url: string, altText: string): Promise<void>;
}
