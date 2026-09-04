import type { PaymentEntity } from "../../../payments/domain/entities/payment.entity";
import type { AdminOrderView } from "../../../orders/application/use-cases/get-order-for-admin.use-case";

export interface AdminOrderDetailView extends AdminOrderView {
  /** Week 3 Day 6 — "Payment visibility" (week3.md's admin scope): the order's own `paymentMethod` (COD/RAZORPAY) says HOW, not whether money actually moved. Staff need the latter — especially for COD, where CONFIRMED just means "order accepted," not "collected" (see ConfirmCodOrderUseCase's own doc comment on that exact confusion). Null only in the narrow window before checkout's own Payment row exists — shouldn't be observable in practice (COD/Razorpay both create one before the order leaves PENDING_PAYMENT). */
  paymentStatus: PaymentEntity["status"] | null;
}

/**
 * Composed here, in `admin`, not in `orders`: `payments` already imports
 * `orders` (via `OrderPort`), so `orders` importing back from `payments`
 * would close a cycle (ADR-010) — same reasoning `CancelOrderWithRefundUseCase`
 * and `GetCustomerDetailUseCase` already document for living here instead
 * of in the module whose own data this is mostly about.
 */
export class GetOrderDetailForAdminUseCase {
  constructor(
    private readonly getOrderForAdmin: { execute(orderId: string): Promise<AdminOrderView> },
    private readonly getPaymentForOrder: { execute(orderId: string): Promise<PaymentEntity | null> },
  ) {}

  async execute(orderId: string): Promise<AdminOrderDetailView> {
    const [order, payment] = await Promise.all([
      this.getOrderForAdmin.execute(orderId),
      this.getPaymentForOrder.execute(orderId),
    ]);
    return { ...order, paymentStatus: payment?.status ?? null };
  }
}
