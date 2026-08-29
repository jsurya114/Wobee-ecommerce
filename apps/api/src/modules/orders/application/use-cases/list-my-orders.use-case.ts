import type { OrderSummaryEntity } from "../../domain/entities/order.entity";
import type { OrderRepositoryPort } from "../ports/order-repository.port";

/** "My Orders" — logged-in customers only (no guest order history, ADR-011: guest identity doesn't persist across sessions the way an account does). */
export class ListMyOrdersUseCase {
  constructor(private readonly orderRepository: OrderRepositoryPort) {}

  execute(userId: string): Promise<OrderSummaryEntity[]> {
    return this.orderRepository.findSummariesByUserId(userId);
  }
}
