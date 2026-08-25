import { ConflictError, NotFoundError } from "../../../../shared/errors";
import type { InventoryFinalizationPort } from "../ports/inventory-finalization.port";
import type { OrderPort } from "../ports/order-port";
import type { PaymentRepositoryPort } from "../ports/payment-repository.port";
import type { TransactionPort } from "../ports/transaction.port";

/**
 * COD's "no gateway step" (week1_excecution_prompt.md Day 5): confirms the
 * order immediately, no Razorpay involvement. Inside one transaction —
 * order CONFIRMED, a COD Payment row recorded (for consistent accounting
 * alongside Razorpay payments), and the reservation finalized into a real
 * stock deduction (ADR-015) — all three commit together.
 */
export class ConfirmCodOrderUseCase {
  constructor(
    private readonly orderPort: OrderPort,
    private readonly paymentRepository: PaymentRepositoryPort,
    private readonly inventoryFinalization: InventoryFinalizationPort,
    private readonly transaction: TransactionPort,
  ) {}

  async execute(orderId: string, requesterUserId: string | undefined): Promise<{ alreadyConfirmed: boolean }> {
    const order = await this.orderPort.getOrder(orderId);
    if (!order || (order.userId && order.userId !== requesterUserId)) {
      throw new NotFoundError("Order not found");
    }
    if (order.paymentMethod !== "COD") {
      throw new ConflictError("This order isn't a cash-on-delivery order");
    }
    if (order.status === "CONFIRMED") {
      return { alreadyConfirmed: true }; // idempotent no-op — a retried/duplicate call, not an error
    }
    if (order.status !== "PENDING_PAYMENT") {
      throw new ConflictError(`Cannot confirm an order in status ${order.status}`);
    }

    return this.transaction.run(async (tx) => {
      const { changed } = await this.orderPort.confirm(order.id, tx);
      if (!changed) {
        // Raced with another confirmation of the SAME order between our
        // pre-check above and this transaction — someone else already won;
        // don't double-record a Payment or double-finalize inventory.
        return { alreadyConfirmed: true };
      }

      await this.paymentRepository.create(
        { orderId: order.id, provider: "COD", status: "CAPTURED", amountPaise: order.totalPaise },
        tx,
      );
      await this.inventoryFinalization.finalize(order.items, tx);

      return { alreadyConfirmed: false };
    });
  }
}
