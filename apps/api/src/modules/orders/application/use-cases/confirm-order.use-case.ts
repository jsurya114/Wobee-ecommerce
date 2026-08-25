import { ConflictError, NotFoundError } from "../../../../shared/errors";
import type { OrderRepositoryPort, TransitionOrderStatusResult } from "../ports/order-repository.port";

/**
 * Owns the `PENDING_PAYMENT -> CONFIRMED` transition (plan.md §4's order
 * state machine) — the ONLY place that writes it. `payments` triggers this
 * through the port `payments.module.ts` wires to it, never by writing to
 * the Order table itself (ARCHITECTURE.md §3.3). Runs inside the caller's
 * transaction (`tx`) so it commits atomically with whatever else the
 * caller is doing (recording the Payment row, finalizing inventory).
 *
 * Idempotent by design (ADR-014's mandatory dedup requirement): a second
 * call for an already-CONFIRMED order is a no-op success, not an error —
 * this is what makes a duplicate/retried webhook delivery safe.
 */
export class ConfirmOrderUseCase {
  constructor(private readonly orderRepository: OrderRepositoryPort) {}

  async execute(orderId: string, tx: unknown): Promise<TransitionOrderStatusResult> {
    const existing = await this.orderRepository.findById(orderId);
    if (!existing) {
      throw new NotFoundError("Order not found");
    }
    if (existing.status === "CONFIRMED") {
      return { changed: false, order: existing }; // already confirmed — idempotent no-op
    }
    if (existing.status !== "PENDING_PAYMENT") {
      throw new ConflictError(`Cannot confirm an order in status ${existing.status}`);
    }

    return this.orderRepository.transitionStatus(orderId, "PENDING_PAYMENT", "CONFIRMED", tx);
  }
}
