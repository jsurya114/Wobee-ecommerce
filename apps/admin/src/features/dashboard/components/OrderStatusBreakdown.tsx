import { Card, SectionHeader } from "@woobe/ui";
import type { OrderStatusCount } from "../api/dashboard.client";

/** plan.md §4's own lifecycle order — not the arbitrary order a SQL GROUP BY returns. */
const STATUS_ORDER = ["PENDING_PAYMENT", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "PAYMENT_FAILED"] as const;

/**
 * Order counts by status, one period — a bar-per-category chart where
 * color encodes MAGNITUDE (the shared "count" metric), not identity, so
 * every bar is the same single hue and each row's own label is what
 * distinguishes it (dataviz skill: "color follows the entity" only applies
 * when color is doing identity work — here it isn't).
 */
export function OrderStatusBreakdown({ counts }: { counts: OrderStatusCount[] }) {
  const byStatus = new Map(counts.map((c) => [c.status, c.count]));
  const rows = STATUS_ORDER.map((status) => ({ status, count: byStatus.get(status) ?? 0 }));
  const maxCount = Math.max(1, ...rows.map((r) => r.count));

  return (
    <Card flat className="p-4">
      <SectionHeader>Orders by status</SectionHeader>
      <ul className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <li key={row.status} className="flex items-center gap-3">
            <span className="w-32 shrink-0 font-body text-xs text-text-secondary">{formatStatus(row.status)}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-primary/70" style={{ width: `${(row.count / maxCount) * 100}%` }} />
            </div>
            <span className="w-6 shrink-0 text-right font-body text-xs font-medium text-text-primary">{row.count}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function formatStatus(status: string): string {
  return status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}
