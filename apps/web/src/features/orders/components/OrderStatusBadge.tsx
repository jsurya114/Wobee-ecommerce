import { Badge } from "@woobe/ui";

/**
 * Shared across OrderConfirmation and OrderDetail (Week 2 Day 6 code-quality
 * pass — these two files had nearly identical inline copies of this exact
 * label-formatting + variant lookup, found while auditing this session's
 * own work; consolidated since one is a strict superset of the other's
 * status coverage, so nothing either caller shows changes).
 */
export function OrderStatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, " ").toLowerCase();
  if (status === "DELIVERED" || status === "CONFIRMED") return <Badge variant="success">{label}</Badge>;
  if (status === "CANCELLED" || status === "PAYMENT_FAILED") return <Badge variant="error">{label}</Badge>;
  return <Badge variant="neutral">{label}</Badge>;
}
