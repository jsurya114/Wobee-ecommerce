/**
 * Unit-of-Work boundary for checkout (ADR-015). The application layer
 * never inspects `tx` — it only threads the same opaque handle through to
 * the write ports it's given (inventory reservation, cart conversion, order
 * creation) so all three commit or roll back together. Only
 * orders/infrastructure (which already imports Prisma per ADR-010) — and
 * each other module's own infrastructure, which is handed this same handle
 * — ever casts it back to a real transaction client.
 */
export interface TransactionPort {
  run<T>(fn: (tx: unknown) => Promise<T>): Promise<T>;
}
