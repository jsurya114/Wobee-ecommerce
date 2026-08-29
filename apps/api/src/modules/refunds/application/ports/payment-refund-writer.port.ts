/** The one write this module is allowed to trigger on Payment — routed through `payments`' own use-case, never direct Prisma access (ADR-025). */
export interface PaymentRefundWriterPort {
  markRefunded(paymentId: string): Promise<void>;
}
