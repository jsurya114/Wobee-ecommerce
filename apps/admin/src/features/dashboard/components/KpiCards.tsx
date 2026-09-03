import { formatPaiseAsInr } from "@woobe/utils";
import { Card } from "@woobe/ui";
import Link from "next/link";
import type { AdminDashboardView } from "../api/dashboard.client";

interface KpiCardsProps {
  revenue: AdminDashboardView["revenue"];
  newCustomersCount: number;
  pendingReturnsCount: number;
}

/**
 * The dashboard's headline numbers (client-review request, 2026-09-03).
 * "Collected" vs "Pending (COD)" only reads correctly now that
 * ConfirmCodOrderUseCase/DeliverOrderAndCapturePaymentUseCase actually
 * distinguish "order confirmed" from "cash in hand" — before that fix,
 * every COD order looked collected the moment it was placed.
 */
export function KpiCards({ revenue, newCustomersCount, pendingReturnsCount }: KpiCardsProps) {
  const tiles: { label: string; value: string; hint?: string; href?: string }[] = [
    { label: "Total revenue", value: formatPaiseAsInr(revenue.totalRevenuePaise), hint: `${revenue.orderCount} orders` },
    { label: "Avg. order value", value: formatPaiseAsInr(revenue.averageOrderValuePaise) },
    { label: "Collected", value: formatPaiseAsInr(revenue.collectedPaise), hint: "cash + captured payments" },
    { label: "Pending (COD)", value: formatPaiseAsInr(revenue.pendingCodPaise), hint: "confirmed, not yet delivered" },
    { label: "New customers", value: String(newCustomersCount) },
    { label: "Returns awaiting action", value: String(pendingReturnsCount), href: pendingReturnsCount > 0 ? "/returns" : undefined },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((tile) => {
        const content = (
          <>
            <p className="font-body text-xs font-medium uppercase tracking-wide text-text-secondary">{tile.label}</p>
            <p className={`mt-1.5 font-display text-xl ${tile.href ? "text-primary" : "text-text-primary"}`}>{tile.value}</p>
            {tile.hint ? <p className="mt-0.5 font-body text-xs text-text-secondary">{tile.hint}</p> : null}
          </>
        );
        return tile.href ? (
          <Link key={tile.label} href={tile.href}>
            <Card flat className="p-4 transition-colors hover:border-primary">
              {content}
            </Card>
          </Link>
        ) : (
          <Card key={tile.label} flat className="p-4">
            {content}
          </Card>
        );
      })}
    </div>
  );
}
