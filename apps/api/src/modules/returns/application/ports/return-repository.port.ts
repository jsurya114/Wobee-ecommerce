import type { ReturnEntity, ReturnStatus } from "../../domain/entities/return.entity";

export interface CreateReturnItemInput {
  orderItemId: string;
  quantity: number;
  reasonDetail?: string;
}

export interface CreateReturnInput {
  orderId: string;
  reason: string;
  items: CreateReturnItemInput[];
}

/** One line across every Return ever filed against an order — what resolveReturnEligibility's own `existingReturnLines` needs. */
export interface ReturnLineForOrder {
  orderItemId: string;
  quantity: number;
  status: ReturnStatus;
}

export interface ReturnSummaryEntity {
  id: string;
  orderId: string;
  orderNumber: string;
  status: ReturnStatus;
  reason: string;
  requestedAt: Date;
  resolvedAt: Date | null;
  itemCount: number;
}

/** Admin list row — adds customer contact, same pattern AdminOrderSummaryEntity already established for orders. */
export interface AdminReturnSummaryEntity extends ReturnSummaryEntity {
  contactName: string;
  contactEmail: string;
}

export interface ListReturnsFilter {
  status?: ReturnStatus;
  page: number;
  pageSize: number;
}

export interface ListReturnsResult {
  items: AdminReturnSummaryEntity[];
  total: number;
}

export interface TransitionReturnStatusResult {
  /** false when the return wasn't in `from` at the time of the update — an idempotency/race guard, same conditional-update pattern orders' own transitionStatus uses. */
  changed: boolean;
  return: ReturnEntity;
}

/**
 * application depends on this interface, not on Prisma directly
 * (ARCHITECTURE.md §3.1). Owns Return/ReturnItem only (ADR-010).
 */
export interface ReturnRepositoryPort {
  create(input: CreateReturnInput): Promise<ReturnEntity>;
  findById(returnId: string): Promise<ReturnEntity | null>;
  findLinesByOrderId(orderId: string): Promise<ReturnLineForOrder[]>;
  /** `orderId` narrows to one order's own returns — see ListMyReturnsUseCase's own comment on why this matters. */
  findSummariesByUserId(userId: string, orderId?: string): Promise<ReturnSummaryEntity[]>;
  findAllPaginated(filter: ListReturnsFilter): Promise<ListReturnsResult>;
  transitionStatus(
    returnId: string,
    from: ReturnStatus,
    to: ReturnStatus,
    extraFields?: Partial<Pick<ReturnEntity, "resolvedAt">>,
  ): Promise<TransitionReturnStatusResult>;
  /** Count of returns for this order still in a non-terminal state — used to decide whether `Order.hasActiveReturn` can be cleared once one resolves. */
  countActiveByOrderId(orderId: string): Promise<number>;
}
