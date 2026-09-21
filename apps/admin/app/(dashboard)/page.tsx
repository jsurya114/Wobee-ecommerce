"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { navEntriesForRole, hasPermission } from "@/features/shell/nav-config";
import { LoadingState } from "@/features/shell/components/LoadingState";
import type { DashboardSelection } from "@/features/dashboard/api/dashboard.client";
import { AbandonedCartsPanel } from "@/features/dashboard/components/AbandonedCartsPanel";
import { ConversionFunnelPanel } from "@/features/dashboard/components/ConversionFunnelPanel";
import { CustomersTrafficPanel } from "@/features/dashboard/components/CustomersTrafficPanel";
import { DashboardSkeleton } from "@/features/dashboard/components/DashboardSkeleton";
import { DashboardToolbar } from "@/features/dashboard/components/DashboardToolbar";
import { FulfillmentPanel } from "@/features/dashboard/components/FulfillmentPanel";
import { InventoryPanel } from "@/features/dashboard/components/InventoryPanel";
import { LowStockPanel } from "@/features/dashboard/components/LowStockPanel";
import { MerchandisingPanel } from "@/features/dashboard/components/MerchandisingPanel";
import { OverviewKpis } from "@/features/dashboard/components/OverviewKpis";
import { PaymentHealthPanel } from "@/features/dashboard/components/PaymentHealthPanel";
import { SalesPerformance } from "@/features/dashboard/components/SalesPerformance";
import { useAdminDashboard } from "@/features/dashboard/hooks/useAdminDashboard";

const DEFAULT_SELECTION: DashboardSelection = { range: "30d", compare: "previous" };

/**
 * Business-analytics dashboard (2026-09-21). One date selection feeds one
 * request, so every panel always describes the same period. Reading order
 * follows the owner's questions: how much did we sell / make → are customers
 * converting → are orders and payments healthy → what sells and what stock is
 * tied up → who is buying → what needs attention.
 */
export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAdminAuth();
  // "Dashboard" (this page) is VIEW_ANALYTICS-only (super_admin) — a staff
  // role landing here (a stale bookmark, browser back, typing "/" directly;
  // LoginForm's own post-login redirect already sends staff elsewhere)
  // gets bounced to the first section their role actually has, same
  // fallback logic LoginForm uses, rather than a 403 error state.
  const canView = !user || hasPermission(user.role, "VIEW_ANALYTICS");
  useEffect(() => {
    if (user && !canView) {
      const firstLiveEntry = navEntriesForRole(user.role).find((entry) => entry.status === "live");
      router.replace(firstLiveEntry?.href ?? "/orders");
    }
  }, [user, canView, router]);

  const [selection, setSelection] = useState<DashboardSelection>(DEFAULT_SELECTION);
  const { dashboard, loading, updating, error } = useAdminDashboard(selection, canView);

  if (!canView) {
    return <LoadingState />; // redirect effect above is already firing
  }

  return (
    <div className="flex flex-col gap-5">
      <DashboardToolbar selection={selection} onChange={setSelection} period={dashboard?.period} updating={updating} />

      {loading ? (
        <DashboardSkeleton />
      ) : error || !dashboard ? (
        <p className="py-12 text-center font-body text-sm text-error">{error ?? "Couldn't load the dashboard."}</p>
      ) : (
        <div className={updating ? "flex flex-col gap-5 opacity-70 transition-opacity" : "flex flex-col gap-5 transition-opacity"}>
          <OverviewKpis d={dashboard} />
          <SalesPerformance d={dashboard} />
          <ConversionFunnelPanel d={dashboard} />
          <FulfillmentPanel d={dashboard} />
          <PaymentHealthPanel d={dashboard} />
          <MerchandisingPanel d={dashboard} />
          <InventoryPanel d={dashboard} />
          <CustomersTrafficPanel d={dashboard} />
          <div className="grid gap-4 lg:grid-cols-2">
            <AbandonedCartsPanel d={dashboard} />
            <LowStockPanel d={dashboard} />
          </div>
        </div>
      )}
    </div>
  );
}
