"use client";

import type { ListStaffQuery } from "@woobe/validation";
import { useQuery } from "@tanstack/react-query";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import * as staffApi from "../api/admin-staff.client";

export function staffListQueryKey(filter: ListStaffQuery) {
  return ["admin", "staff", "list", filter] as const;
}

/** Deliberately unpaginated — expected staff headcount is small (see ListStaffUseCase's own comment on the API side). */
export function useAdminStaffList(filter: ListStaffQuery) {
  const { withFreshToken } = useAdminAuth();

  const query = useQuery({
    queryKey: staffListQueryKey(filter),
    queryFn: () => withFreshToken((token) => staffApi.listStaff(filter, token)),
  });

  const error = query.error
    ? query.error instanceof ApiError && query.error.status === 403
      ? "You don't have permission to view staff."
      : "Couldn't load staff."
    : null;

  return {
    items: query.data?.items ?? [],
    loading: query.isPending,
    error,
    refetch: query.refetch,
  };
}
