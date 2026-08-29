import type { Role } from "@woobe/types";
import { ConflictError, NotFoundError } from "../../../../shared/errors";
import type { InventoryRestockPort } from "../ports/inventory-restock.port";
import type { OrderRepositoryPort, TransitionOrderStatusResult } from "../ports/order-repository.port";
import type { TransactionPort } from "../ports/transaction.port";

/**
 * `CONFIRMED`/`PROCESSING` -> `CANCELLED` (architecture.md §4's
 * pre-shipment-only cancellation). Owns ONLY the parts of cancellation that
 * belong to this module: the status guard, the conditional status transition,
 * and restocking the sold stock — all atomically in one transaction.
 *
 * Week 2 Day 0 remediation: this used to call an `InventoryReleasePort`
 * wired to inventory's reservation-*release* operation — correct for a
 * `PENDING_PAYMENT -> PAYMENT_FAILED` order (a hold that was never sold),
 * wrong here. By the time an order reaches `CONFIRMED`/`PROCESSING`,
 * `finalizeReservation` has already run — `quantityReserved` for its items
 * is already 0, so "releasing" a reservation found nothing to release and
 * silently no-opped, permanently shrinking the sellable pool by every
 * cancelled order's quantity. Now wired (see orders.module.ts) to
 * inventory's `restockFinalizedSale`, which puts the stock back into
 * `quantityAvailable` instead.
 *
 * The refund that a cancellation implies (a `CONFIRMED` order was already
 * paid — see ADR-014/ADR-025) and the `ORDER_CANCELLED` audit entry are
 * deliberately NOT here: `orders` cannot import `refunds` without recreating
 * an import cycle (`payments` imports `orders`, and `refunds` imports
 * `payments`). Those steps live one level up in
 * `admin`'s CancelOrderWithRefundUseCase, which composes this use-case with
 * `refunds` and `audit`. `changed: false` (a concurrent cancel already won)
 * is the signal to that orchestrator to skip both — the same guard also
 * makes a repeated cancel of the same order restock-idempotent: the
 * conditional transition only succeeds once, so `restock` below only ever
 * runs on the call that actually wins.
 */
export class CancelOrderUseCase {
  constructor(
    private readonly orderRepository: OrderRepositoryPort,
    private readonly inventoryRestock: InventoryRestockPort,
    private readonly transaction: TransactionPort,
  ) {}

  async execute(orderId: string, _actor: { id: string; role: Role }, reason?: string): Promise<TransitionOrderStatusResult> {
    const existing = await this.orderRepository.findById(orderId);
    if (!existing) {
      throw new NotFoundError("Order not found");
    }
    if (existing.status === "CANCELLED") {
      return { order: existing, changed: false }; // idempotent no-op
    }
    if (existing.status !== "CONFIRMED" && existing.status !== "PROCESSING") {
      throw new ConflictError(`Cannot cancel an order in status ${existing.status}`);
    }
    const fromStatus = existing.status;

    return this.transaction.run(async (tx) => {
      const result = await this.orderRepository.transitionStatus(orderId, fromStatus, "CANCELLED", tx, {
        cancelledAt: new Date(),
        cancellationReason: reason ?? null,
      });
      if (result.changed) {
        await this.inventoryRestock.restock(
          result.order.items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
          tx,
        );
      }
      return result;
    });
  }
}
