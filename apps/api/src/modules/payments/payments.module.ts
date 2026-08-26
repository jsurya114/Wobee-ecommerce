// Composition root for the payments module (ARCHITECTURE.md §3.2) — wires
// repos/services to use-cases to routes, and wires this module's own ports
// to `orders`' and `inventory`'s exported use-cases as trivial pass-through
// adapters (same pattern as every other module's composition root). Never
// writes to Order/Inventory directly — every transition goes through the
// port, which calls the owning module's own use-case (ARCHITECTURE.md §3.3).
import { finalizeReservationUseCase, releaseReservationUseCase } from "../inventory/inventory.module";
import { confirmOrderUseCase, getOrderForPaymentUseCase, markOrderPaymentFailedUseCase } from "../orders/orders.module";
import type { InventoryFinalizationPort } from "./application/ports/inventory-finalization.port";
import type { OrderPort } from "./application/ports/order-port";
import { ConfirmCodOrderUseCase } from "./application/use-cases/confirm-cod-order.use-case";
import { CreateRazorpayOrderUseCase } from "./application/use-cases/create-razorpay-order.use-case";
import { GetPaymentForOrderUseCase } from "./application/use-cases/get-payment-for-order.use-case";
import { HandleRazorpayWebhookUseCase } from "./application/use-cases/handle-razorpay-webhook.use-case";
import { MarkPaymentRefundedUseCase } from "./application/use-cases/mark-payment-refunded.use-case";
import { PaymentRepository } from "./infrastructure/repositories/payment.repository";
import { PrismaTransactionRunner } from "./infrastructure/repositories/transaction.repository";
import { WebhookEventRepository } from "./infrastructure/repositories/webhook-event.repository";
import { RazorpayService } from "./infrastructure/services/razorpay.service";
import { PaymentsController } from "./interface/http/payments.controller";
import { createPaymentsRouter } from "./interface/http/payments.routes";

const paymentRepository = new PaymentRepository();
const webhookEventRepository = new WebhookEventRepository();
const transactionRunner = new PrismaTransactionRunner();
const razorpayService = new RazorpayService();

const orderPort: OrderPort = {
  getOrder: (orderId) => getOrderForPaymentUseCase.execute(orderId),
  confirm: (orderId, tx) => confirmOrderUseCase.execute(orderId, tx),
  markPaymentFailed: (orderId, tx) => markOrderPaymentFailedUseCase.execute(orderId, tx),
};
const inventoryFinalization: InventoryFinalizationPort = {
  finalize: (items, tx) => finalizeReservationUseCase.execute(items, tx),
  release: (items, tx) => releaseReservationUseCase.execute(items, tx),
};

const createRazorpayOrderUseCase = new CreateRazorpayOrderUseCase(orderPort, paymentRepository, razorpayService);
const confirmCodOrderUseCase = new ConfirmCodOrderUseCase(orderPort, paymentRepository, inventoryFinalization, transactionRunner);
const handleRazorpayWebhookUseCase = new HandleRazorpayWebhookUseCase(
  razorpayService,
  webhookEventRepository,
  paymentRepository,
  orderPort,
  inventoryFinalization,
  transactionRunner,
);

/** Exported for cross-module use — `refunds` (ADR-025) reads/writes Payment only through these two, never directly. */
export const getPaymentForOrderUseCase = new GetPaymentForOrderUseCase(paymentRepository);
export const markPaymentRefundedUseCase = new MarkPaymentRefundedUseCase(paymentRepository);

const paymentsController = new PaymentsController(createRazorpayOrderUseCase, confirmCodOrderUseCase, handleRazorpayWebhookUseCase);

export const router = createPaymentsRouter(paymentsController);
