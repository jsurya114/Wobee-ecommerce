import { NotFoundError } from "../../../../shared/errors";
import type { OrderEntity } from "../../domain/entities/order.entity";
import type { OrderRepositoryPort } from "../ports/order-repository.port";

/**
 * Customer-facing order lookup (order-confirmation page, "My Orders").
 * A logged-in customer's order requires ownership — a guest order (no
 * `userId`) is readable by ID alone, same trust model as the guest cart
 * cookie: the id is an unguessable uuid, not a directory listing. Returns
 * 404 rather than 403 for "exists but isn't yours" — same
 * don't-reveal-more-than-necessary posture as auth's login error (never
 * distinguish "wrong" from "not allowed" in the response).
 */
export class GetOrderUseCase {
  constructor(private readonly orderRepository: OrderRepositoryPort) {}

  async execute(orderId: string, requesterUserId: string | undefined): Promise<OrderEntity> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundError("Order not found");
    }
    if (order.userId && order.userId !== requesterUserId) {
      throw new NotFoundError("Order not found");
    }
    return order;
  }
}
