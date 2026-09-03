"use client";

import { useQuery } from "@tanstack/react-query";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import * as dashboardApi from "../api/dashboard.client";

export function dashboardQueryKey(days: number) {
  return ["admin", "dashboard", days] as const;
}

export function useAdminDashboard(days: number, enabled = true) {
  const { withFreshToken } = useAdminAuth();

  const query = useQuery({
    queryKey: dashboardQueryKey(days),
    queryFn: () => withFreshToken((token) => dashboardApi.getDashboard(days, token)),
    enabled,
  });

  const error = query.error
    ? query.error instanceof ApiError && query.error.status === 403
      ? "You don't have permission to view analytics."
      : "Couldn't load the dashboard."
    : null;

  return {
    dashboard: query.data,
    loading: query.isPending,
    error,
    refetch: query.refetch,
  };
}
