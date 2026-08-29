import type { OrderRepositoryPort } from "../ports/order-repository.port";

/** Exported for `reviews` to consume through a port (Week 2 Day 4) — see OrderRepositoryPort.hasUserPurchasedProduct's own doc comment for the exact status rule. */
export class HasPurchasedProductUseCase {
  constructor(private readonly orderRepository: OrderRepositoryPort) {}

  execute(userId: string, productId: string): Promise<boolean> {
    return this.orderRepository.hasUserPurchasedProduct(userId, productId);
  }
}
