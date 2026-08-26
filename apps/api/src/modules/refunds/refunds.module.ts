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

/** Exported for cross-module use — `orders`' CancelOrderUseCase calls this, never `payments` directly (ADR-025). */
export const issueRefundForCancelledOrderUseCase = new IssueRefundForCancelledOrderUseCase(
  paymentReader,
  paymentRefundWriter,
  razorpayRefundService,
  refundRepository,
);

export const router = Router();
