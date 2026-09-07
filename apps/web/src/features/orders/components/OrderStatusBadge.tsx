import { Badge } from "@woobe/ui";

/**
 * Shared across OrderConfirmation and OrderDetail (Week 2 Day 6 code-quality
 * pass — these two files had nearly identical inline copies of this exact
 * label-formatting + variant lookup, found while auditing this session's
 * own work; consolidated since one is a strict superset of the other's
 * status coverage, so nothing either caller shows changes).
 */
export function OrderStatusBadge({ status }: { status: string }) {
  // Human-friendly wording for the two 2026-09-06 checkpoints (order-processing
  // audit) — every other status still falls through to the generic label below.
  if (status === "PACKED") return <Badge variant="neutral">Packed and ready to ship</Badge>;
  if (status === "RETURNED_TO_ORIGIN") return <Badge variant="error">Delivery failed — returning to seller</Badge>;

  const label = status.replace(/_/g, " ").toLowerCase();
  if (status === "DELIVERED" || status === "CONFIRMED") return <Badge variant="success">{label}</Badge>;
  if (status === "CANCELLED" || status === "PAYMENT_FAILED") return <Badge variant="error">{label}</Badge>;
  return <Badge variant="neutral">{label}</Badge>;
}
