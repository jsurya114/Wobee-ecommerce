// Composition root for the refunds module (ARCHITECTURE.md §3.2). Owns
// Refund. Pulled forward from Week 4 — admin-cancellation refund path
// only (ADR-025); the full customer-initiated return/exchange request
// flow (Return entity, its own UI) stays Week 4 scope. Reads/writes
// Payment ONLY through payments' own exported use-cases (never direct
// Prisma access to a table this module doesn't own) — split ownership by
// transition type, not a blanket boundary exception.
import { Router } from "express";
import { getPaymentForOrderUseCase, markPaymentRefundedUseCase } from "../payments/payments.module";
import type { PaymentReaderPort } from "./application/ports/payment-reader.port";
import type { PaymentRefundWriterPort } from "./application/ports/payment-refund-writer.port";
import { IssueRefundForCancelledOrderUseCase } from "./application/use-cases/issue-refund-for-cancelled-order.use-case";
import { RefundRepository } from "./infrastructure/repositories/refund.repository";
import { RazorpayRefundService } from "./infrastructure/services/razorpay-refund.service";

const refundRepository = new RefundRepository();
const razorpayRefundService = new RazorpayRefundService();

const paymentReader: PaymentReaderPort = { findByOrderId: (orderId) => getPaymentForOrderUseCase.execute(orderId) };
const paymentRefundWriter: PaymentRefundWriterPort = { markRefunded: (paymentId) => markPaymentRefundedUseCase.execute(paymentId) };

/**
 * Exported for cross-module use — `admin`'s CancelOrderWithRefundUseCase
 * calls this. NOT `orders`: an orders -> refunds edge would close the cycle
 * orders -> refunds -> payments -> orders, since this module imports
 * `payments` and `payments` imports `orders` (ADR-025). Cancellation is
 * therefore composed in `admin`, which nothing imports back.
 */
export const issueRefundForCancelledOrderUseCase = new IssueRefundForCancelledOrderUseCase(
  paymentReader,
  paymentRefundWriter,
  razorpayRefundService,
  refundRepository,
);

export const router = Router();
