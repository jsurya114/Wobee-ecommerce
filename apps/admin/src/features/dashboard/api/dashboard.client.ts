import { apiFetch } from "@/lib/api-client";

export interface DailyRevenuePoint {
  date: string;
  revenuePaise: number;
  orderCount: number;
}

export interface OrderStatusCount {
  status: string;
  count: number;
}

export interface DashboardBestSeller {
  productId: string;
  name: string;
  slug: string;
  quantitySold: number;
}

export interface DashboardLowStockRow {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  color: string;
  size: string;
  quantityAvailable: number;
  quantityReserved: number;
}

export interface AdminDashboardView {
  range: { from: string; to: string };
  revenue: {
    totalRevenuePaise: number;
    orderCount: number;
    averageOrderValuePaise: number;
    collectedPaise: number;
    pendingCodPaise: number;
  };
  dailyRevenue: DailyRevenuePoint[];
  statusCounts: OrderStatusCount[];
  newCustomersCount: number;
  bestSellers: DashboardBestSeller[];
  lowStock: DashboardLowStockRow[];
  lowStockTotal: number;
  pendingReturnsCount: number;
}

/** VIEW_ANALYTICS-gated (super_admin only — see apps/api's permissions.ts). */
export function getDashboard(days: number, accessToken: string): Promise<AdminDashboardView> {
  return apiFetch<AdminDashboardView>(`/api/v1/admin/analytics/dashboard?days=${days}`, { accessToken });
}
