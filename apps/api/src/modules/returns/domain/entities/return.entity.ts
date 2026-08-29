import type { ReturnStatus } from "@woobe/types";

export type { ReturnStatus };

export interface ReturnItemEntity {
  id: string;
  orderItemId: string;
  quantity: number;
  reasonDetail: string | null;
}

/** Mirrors schema.prisma's `Return` model exactly (plan.md §4's finalized state machine) — no fields beyond what that model actually has. */
export interface ReturnEntity {
  id: string;
  orderId: string;
  status: ReturnStatus;
  reason: string;
  requestedAt: Date;
  resolvedAt: Date | null;
  items: ReturnItemEntity[];
}

/** A return resolved to its final state — no further transition is possible from here. */
export const TERMINAL_RETURN_STATUSES: ReadonlySet<ReturnStatus> = new Set(["RETURN_REJECTED", "REFUNDED"]);
