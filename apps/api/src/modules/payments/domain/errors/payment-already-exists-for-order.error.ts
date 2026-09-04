/**
 * Internal signal only — never reaches a controller/HTTP response. Thrown
 * by PaymentRepositoryPort.create() when the Payment.orderId unique
 * constraint fires (Week 3 Day 4 hardening): two concurrent
 * "set up payment for this order" requests (a double-click on Pay Now, a
 * client retry) raced on creating the one-Payment-row-per-order. The
 * use-case re-reads and defers to whichever request is already finished,
 * same shape as WebhookEventAlreadyExistsError/OrderNumberCollisionError.
 */
export class PaymentAlreadyExistsForOrderError extends Error {
  constructor() {
    super("Payment already exists for this order");
    this.name = "PaymentAlreadyExistsForOrderError";
  }
}
