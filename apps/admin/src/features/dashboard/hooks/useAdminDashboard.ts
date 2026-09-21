"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import * as dashboardApi from "../api/dashboard.client";
import type { DashboardSelection } from "../api/dashboard.client";

export function dashboardQueryKey(selection: DashboardSelection) {
  return ["admin", "dashboard", selection.range, selection.compare, selection.from ?? null, selection.to ?? null] as const;
}

/**
 * One query = one date selection = every panel (they can never drift onto
 * different periods). The previous result stays on screen while a new range
 * loads, so switching presets doesn't flash the whole page back to skeletons;
 * `isFetching` drives a subtle "updating" cue instead.
 */
export function useAdminDashboard(selection: DashboardSelection, enabled = true) {
  const { withFreshToken } = useAdminAuth();

  const query = useQuery({
    queryKey: dashboardQueryKey(selection),
    queryFn: () => withFreshToken((token) => dashboardApi.getDashboard(selection, token)),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const error = query.error
    ? query.error instanceof ApiError && query.error.status === 403
      ? "You don't have permission to view analytics."
      : query.error instanceof ApiError && query.error.status === 400
        ? query.error.message
        : "Couldn't load the dashboard."
    : null;

  return {
    dashboard: query.data,
    loading: query.isPending,
    updating: query.isFetching && !query.isPending,
    error,
    refetch: query.refetch,
  };
}
