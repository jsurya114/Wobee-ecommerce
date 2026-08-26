/** Narrow port for this module's dependency on `refunds` (ADR-025) — CancelOrderUseCase's one and only route to triggering a refund; never imports `payments` directly (would recreate the orders→payments→orders cycle). */
export interface RefundIssuerPort {
  issueRefundIfNeeded(orderId: string): Promise<{ refundIssued: boolean }>;
}
