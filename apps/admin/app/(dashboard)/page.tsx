"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { navEntriesForRole, hasPermission } from "@/features/shell/nav-config";
import { LoadingState } from "@/features/shell/components/LoadingState";
import { BestSellersList } from "@/features/dashboard/components/BestSellersList";
import { KpiCards } from "@/features/dashboard/components/KpiCards";
import { LowStockAlert } from "@/features/dashboard/components/LowStockAlert";
import { OrderStatusBreakdown } from "@/features/dashboard/components/OrderStatusBreakdown";
import { RevenueTrendChart } from "@/features/dashboard/components/RevenueTrendChart";
import { useAdminDashboard } from "@/features/dashboard/hooks/useAdminDashboard";

const RANGE_DAYS = 30;

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

  const { dashboard, loading, error } = useAdminDashboard(RANGE_DAYS, canView);

  if (!canView) {
    return <LoadingState />; // redirect effect above is already firing
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-xl text-text-primary">Dashboard</h1>
        <p className="font-body text-sm text-text-secondary">Last {RANGE_DAYS} days.</p>
      </div>

      {loading ? (
        <LoadingState />
      ) : error || !dashboard ? (
        <p className="py-12 text-center font-body text-sm text-error">{error ?? "Couldn't load the dashboard."}</p>
      ) : (
        <>
          <KpiCards revenue={dashboard.revenue} newCustomersCount={dashboard.newCustomersCount} pendingReturnsCount={dashboard.pendingReturnsCount} />
          <RevenueTrendChart points={dashboard.dailyRevenue} />
          <div className="grid gap-4 lg:grid-cols-3">
            <OrderStatusBreakdown counts={dashboard.statusCounts} />
            <BestSellersList bestSellers={dashboard.bestSellers} />
            <LowStockAlert items={dashboard.lowStock} total={dashboard.lowStockTotal} />
          </div>
        </>
      )}
    </div>
  );
}
