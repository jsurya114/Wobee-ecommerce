import { Card, EmptyState, SectionHeader } from "@woobe/ui";
import Link from "next/link";
import type { DashboardLowStockRow } from "../api/dashboard.client";

export function LowStockAlert({ items, total }: { items: DashboardLowStockRow[]; total: number }) {
  return (
    <Card flat className="p-4">
      <SectionHeader action={total > 0 ? <Link href="/inventory">See all →</Link> : undefined}>Low stock</SectionHeader>
      {items.length === 0 ? (
        <EmptyState title="Nothing running low" description="Every variant is comfortably stocked." />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((row) => (
            <li key={row.variantId} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate font-body text-sm text-text-primary">
                {row.productName} <span className="text-text-secondary">· {row.color} · {row.size}</span>
              </span>
              <span className="shrink-0 font-body text-xs font-medium text-error">{row.quantityAvailable} left</span>
            </li>
          ))}
        </ul>
      )}
      {total > items.length ? <p className="mt-2 font-body text-xs text-text-secondary">+{total - items.length} more</p> : null}
    </Card>
  );
}
