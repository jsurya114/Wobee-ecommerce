import { NotFoundError } from "../../../../shared/errors";
import type { OrderEntity } from "../../domain/entities/order.entity";
import type { OrderRepositoryPort } from "../ports/order-repository.port";

/** Admin order lookup — no ownership check (unlike GetOrderUseCase, which is customer-facing and must keep that invariant simple and untouched). */
export class GetOrderForAdminUseCase {
  constructor(private readonly orderRepository: OrderRepositoryPort) {}

  async execute(orderId: string): Promise<OrderEntity> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundError("Order not found");
    }
    return order;
  }
}
