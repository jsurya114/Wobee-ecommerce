import { ConflictError, NotFoundError } from "../../../../shared/errors";
import type { OrderRepositoryPort, TransitionOrderStatusResult } from "../ports/order-repository.port";

/**
 * Owns the `PENDING_PAYMENT -> PAYMENT_FAILED` transition — same shape and
 * rationale as ConfirmOrderUseCase (its own doc comment applies here too).
 * Idempotent: a second call for an already-PAYMENT_FAILED order is a no-op.
 */
export class MarkOrderPaymentFailedUseCase {
  constructor(private readonly orderRepository: OrderRepositoryPort) {}

  async execute(orderId: string, tx: unknown): Promise<TransitionOrderStatusResult> {
    const existing = await this.orderRepository.findById(orderId);
    if (!existing) {
      throw new NotFoundError("Order not found");
    }
    if (existing.status === "PAYMENT_FAILED") {
      return { changed: false, order: existing };
    }
    if (existing.status !== "PENDING_PAYMENT") {
      throw new ConflictError(`Cannot mark an order in status ${existing.status} as payment-failed`);
    }

    return this.orderRepository.transitionStatus(orderId, "PENDING_PAYMENT", "PAYMENT_FAILED", tx);
  }
}
