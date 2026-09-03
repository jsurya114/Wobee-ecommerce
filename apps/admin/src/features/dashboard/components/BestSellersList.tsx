import { Card, EmptyState, SectionHeader } from "@woobe/ui";
import Link from "next/link";
import type { DashboardBestSeller } from "../api/dashboard.client";

/** All-time, not scoped to the dashboard's own date range — see GetAdminDashboardUseCase's own doc comment for why. */
export function BestSellersList({ bestSellers }: { bestSellers: DashboardBestSeller[] }) {
  return (
    <Card flat className="p-4">
      <SectionHeader>Best sellers (all time)</SectionHeader>
      {bestSellers.length === 0 ? (
        <EmptyState title="No sales yet" description="Best sellers will appear here once orders start coming in." />
      ) : (
        <ol className="flex flex-col gap-2">
          {bestSellers.map((product, i) => (
            <li key={product.productId}>
              <Link href="/products" className="-mx-2 flex items-center justify-between gap-3 rounded-control px-2 py-1.5 hover:bg-surface-2">
                <span className="flex min-w-0 items-center gap-2 font-body text-sm text-text-primary">
                  <span className="shrink-0 font-medium text-text-secondary">{i + 1}.</span>
                  <span className="truncate">{product.name}</span>
                </span>
                <span className="shrink-0 font-body text-xs text-text-secondary">{product.quantitySold} sold</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
