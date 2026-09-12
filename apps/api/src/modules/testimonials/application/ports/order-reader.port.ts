export interface TestimonialOrderView {
  id: string;
  userId: string | null;
  status: string;
  orderNumber: string;
}

/**
 * Narrow port onto `orders` (same "adapter, not a direct import" shape as
 * returns' own OrderReaderPort). `forCustomer` reuses `orders`' existing
 * `GetOrderUseCase` — ownership mismatch and "doesn't exist" both surface
 * as NotFoundError, same don't-reveal-more-than-necessary posture that
 * use-case's own doc comment already establishes, which is exactly what
 * "a customer cannot submit a testimonial for another customer's order"
 * needs.
 */
export interface OrderReaderPort {
  forCustomer(orderId: string, userId: string): Promise<TestimonialOrderView>;
}
