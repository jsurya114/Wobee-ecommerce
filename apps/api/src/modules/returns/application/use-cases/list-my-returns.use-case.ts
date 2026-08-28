import type { ReturnRepositoryPort, ReturnSummaryEntity } from "../ports/return-repository.port";

/**
 * Customer's own "My returns" list (week2 (1).md §11). `orderId` is an
 * optional narrowing filter, not a separate endpoint — the order-detail
 * page (apps/web) only ever needs this one order's own returns and would
 * otherwise fetch the caller's ENTIRE return history just to find them,
 * growing unbounded over a customer's lifetime for no reason (found while
 * auditing this day's own work for performance, not from a report).
 */
export class ListMyReturnsUseCase {
  constructor(private readonly returnRepository: ReturnRepositoryPort) {}

  execute(userId: string, orderId?: string): Promise<ReturnSummaryEntity[]> {
    return this.returnRepository.findSummariesByUserId(userId, orderId);
  }
}
