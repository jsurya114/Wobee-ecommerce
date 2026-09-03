import type { DailyRevenuePoint } from "../application/ports/order-repository.port";

/**
 * Pure domain function (ARCHITECTURE.md §3.1) — admin analytics dashboard
 * (2026-09-03). Buckets a flat list of orders into one point per calendar
 * day across the WHOLE range, including days with zero orders (a trend
 * chart with silently-missing days reads as broken, not as "no sales").
 * UTC calendar days throughout — same timezone-free posture as
 * OrderNumberGeneratorService's own date formatting.
 */
export function bucketDailyRevenue(
  range: { from: Date; to: Date },
  orders: { placedAt: Date; totalPaise: number }[],
): DailyRevenuePoint[] {
  const buckets = new Map<string, { revenuePaise: number; orderCount: number }>();

  const cursor = new Date(Date.UTC(range.from.getUTCFullYear(), range.from.getUTCMonth(), range.from.getUTCDate()));
  const end = new Date(Date.UTC(range.to.getUTCFullYear(), range.to.getUTCMonth(), range.to.getUTCDate()));
  while (cursor <= end) {
    buckets.set(isoDate(cursor), { revenuePaise: 0, orderCount: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  for (const order of orders) {
    const key = isoDate(order.placedAt);
    const bucket = buckets.get(key);
    if (!bucket) continue; // Defensive — shouldn't happen given the caller's own date-filtered query.
    bucket.revenuePaise += order.totalPaise;
    bucket.orderCount += 1;
  }

  return Array.from(buckets.entries()).map(([date, bucket]) => ({ date, ...bucket }));
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
