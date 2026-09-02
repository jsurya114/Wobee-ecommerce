"use client";

import { useQuery } from "@tanstack/react-query";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import * as returnsApi from "../api/admin-returns.client";
import type { ListReturnsParams } from "../api/admin-returns.client";

export function returnsQueryKey(filter: ListReturnsParams) {
  return ["admin", "returns", "list", filter] as const;
}

export function useAdminReturns(filter: ListReturnsParams) {
  const { withFreshToken } = useAdminAuth();

  const query = useQuery({
    queryKey: returnsQueryKey(filter),
    queryFn: () => withFreshToken((token) => returnsApi.listReturns(filter, token)),
  });

  const error = query.error
    ? query.error instanceof ApiError && query.error.status === 403
      ? "You don't have permission to view returns."
      : "Couldn't load returns."
    : null;

  return {
    items: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    loading: query.isPending,
    error,
    refetch: query.refetch,
  };
}
