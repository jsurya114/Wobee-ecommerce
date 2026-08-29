export type IssueRefundOutcome = "completed" | "failed" | "not-applicable";

/**
 * Narrow port onto `refunds` (week2 (1).md §12) — `returns` never touches
 * the Refund table or the Razorpay refund client directly (ADR-010); both
 * live in `refunds`' own infrastructure. `issueForReturn` is idempotent on
 * the `refunds` side (keyed by `returnId`, see IssueRefundForReturnUseCase's
 * own doc comment) — safe to call more than once for the same return.
 */
export interface RefundIssuerPort {
  issueForReturn(returnId: string, orderId: string, amountPaise: number): Promise<{ outcome: IssueRefundOutcome }>;
  /** Manual-completion path — a COD return (no gateway to call) or recovery after a failed/needs-follow-up gateway attempt, once staff have confirmed the money actually moved outside this system. */
  markManuallyCompleted(returnId: string, orderId: string): Promise<void>;
}
