import type { OrderEntity } from "../../domain/entities/order.entity";
import type { OrderRepositoryPort } from "../ports/order-repository.port";

export interface OrderForPayment {
  id: string;
  orderNumber: string;
  userId: string | null;
  status: OrderEntity["status"];
  paymentMethod: OrderEntity["paymentMethod"];
  totalPaise: number;
  items: { variantId: string; quantity: number }[];
}

/**
 * Narrow read view for `payments` — exported from orders.module.ts.
 * Deliberately returns less than the full OrderEntity (no contact/address
 * PII) since this is consumed by the payments module, not shown back to a
 * customer directly.
 */
export class GetOrderForPaymentUseCase {
  constructor(private readonly orderRepository: OrderRepositoryPort) {}

  async execute(orderId: string): Promise<OrderForPayment | null> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) return null;
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      status: order.status,
      paymentMethod: order.paymentMethod,
      totalPaise: order.totalPaise,
      items: order.items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
    };
  }
}
