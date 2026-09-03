import type { Role } from "@woobe/types";
import type { TransitionOrderStatusResult } from "../../../orders/application/ports/order-repository.port";

/** Matches `DeliverOrderUseCase`'s own `execute` signature — see the class doc comment for why the constructor depends on this shape rather than the concrete class. */
interface OrderDeliverer {
  execute(orderId: string, actor: { id: string; role: Role }): Promise<TransitionOrderStatusResult>;
}

/** Matches `MarkCodPaymentCapturedUseCase`'s own `execute` signature. */
interface CodPaymentCapturer {
  execute(orderId: string): Promise<void>;
}

/**
 * WHY THIS LIVES IN `admin` AND NOT IN `orders`: same reasoning as
 * `CancelOrderWithRefundUseCase`'s own doc comment. `payments` already
 * imports `orders` (ConfirmCodOrderUseCase/HandleRazorpayWebhookUseCase
 * call confirmOrderUseCase/markOrderPaymentFailedUseCase) — an
 * `orders -> payments` edge for this would close a cycle. `admin` sits
 * above both, so it composes the delivery status transition (`orders`)
 * with marking a COD order's cash as actually collected (`payments`) — the
 * real-world moment money changes hands for cash-on-delivery, unlike
 * Razorpay's own webhook-verified capture at checkout time.
 *
 * Client-review fix (2026-09-03): before this, a COD order's Payment row
 * was marked CAPTURED immediately at order-confirm time (checkout), before
 * any cash had actually moved — see ConfirmCodOrderUseCase's updated doc
 * comment. This use-case is the fix's other half: the moment the Payment
 * row is allowed to catch up to reality is delivery, not confirmation.
 *
 * A no-op payment-capture attempt (Razorpay order, already-captured
 * payment, etc.) is exactly `MarkCodPaymentCapturedUseCase`'s own
 * responsibility to detect — this use-case doesn't re-check payment method
 * itself, it just always asks after every `changed: true` delivery.
 */
export class DeliverOrderAndCapturePaymentUseCase {
  constructor(
    private readonly deliverOrderUseCase: OrderDeliverer,
    private readonly markCodPaymentCapturedUseCase: CodPaymentCapturer,
  ) {}

  async execute(orderId: string, actor: { id: string; role: Role }): Promise<TransitionOrderStatusResult> {
    const result = await this.deliverOrderUseCase.execute(orderId, actor);
    if (result.changed) {
      await this.markCodPaymentCapturedUseCase.execute(orderId);
    }
    return result;
  }
}
