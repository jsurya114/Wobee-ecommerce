import type { ReturnStatus } from "./entities/return.entity";

/** DECISIONS_PENDING.md #5 — no confirmed return-window policy exists yet; 7 days is a common apparel-return-window default, not a stated business rule. */
export const RETURN_WINDOW_DAYS = 7;

export interface EligibleOrderItem {
  id: string;
  quantity: number;
}

/** One line from an existing Return (any status, any request) against this order — used to compute how much of an item's quantity is already spoken for. */
export interface ExistingReturnLine {
  orderItemId: string;
  quantity: number;
  status: ReturnStatus;
}

export interface RequestedReturnLine {
  orderItemId: string;
  quantity: number;
}

export interface ReturnEligibilityContext {
  now: Date;
  orderStatus: string;
  deliveredAt: Date | null;
  orderItems: EligibleOrderItem[];
  /** Every existing return line for this order, across every Return request ever made against it — REJECTED ones don't count against the remaining quantity (see the loop below), everything else does. */
  existingReturnLines: ExistingReturnLine[];
  requestedLines: RequestedReturnLine[];
}

export interface ReturnEligibilityResult {
  ok: boolean;
  reason?: string;
}

/**
 * Pure, dependency-free (week2 (1).md §11's own rule list: eligibility,
 * return window, quantity validation, duplicate prevention — the last two
 * turn out to be the same check: an order item's "remaining returnable
 * quantity" already accounts for whatever's been requested before,
 * approved or still pending, so a duplicate/over-quantity request is
 * rejected by the exact same arithmetic).
 *
 * Every check that can independently reject runs before the per-line
 * quantity loop, so a customer gets the single most relevant reason, not
 * a generic "can't return this."
 */
export function resolveReturnEligibility(ctx: ReturnEligibilityContext): ReturnEligibilityResult {
  const reject = (reason: string): ReturnEligibilityResult => ({ ok: false, reason });

  if (ctx.orderStatus !== "DELIVERED") {
    return reject("Only delivered orders can be returned");
  }
  if (!ctx.deliveredAt) {
    // Defensive — a DELIVERED order should always carry a deliveredAt
    // timestamp (set atomically by DeliverOrderUseCase); this branch
    // should be unreachable in practice.
    return reject("This order has no recorded delivery date");
  }

  const windowEnd = new Date(ctx.deliveredAt);
  windowEnd.setDate(windowEnd.getDate() + RETURN_WINDOW_DAYS);
  if (ctx.now > windowEnd) {
    return reject(`The return window (${RETURN_WINDOW_DAYS} days after delivery) has passed`);
  }

  if (ctx.requestedLines.length === 0) {
    return reject("Select at least one item to return");
  }

  for (const line of ctx.requestedLines) {
    if (line.quantity < 1) {
      return reject("Quantity must be at least 1");
    }

    const orderItem = ctx.orderItems.find((item) => item.id === line.orderItemId);
    if (!orderItem) {
      return reject("One of the selected items isn't part of this order");
    }

    // A REJECTED prior request frees its quantity back up — everything
    // else (still pending, approved, refund in flight, or already
    // REFUNDED) stays permanently claimed against the ordered quantity.
    const alreadyClaimed = ctx.existingReturnLines
      .filter((existing) => existing.orderItemId === line.orderItemId && existing.status !== "RETURN_REJECTED")
      .reduce((sum, existing) => sum + existing.quantity, 0);

    if (alreadyClaimed + line.quantity > orderItem.quantity) {
      return reject("You've already requested returning all (or more than) the ordered quantity for one of these items");
    }
  }

  return { ok: true };
}
