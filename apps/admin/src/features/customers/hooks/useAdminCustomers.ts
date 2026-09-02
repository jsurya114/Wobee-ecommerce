"use client";

import { useQuery } from "@tanstack/react-query";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import * as customersApi from "../api/admin-customers.client";
import type { ListCustomersParams } from "../api/admin-customers.client";

export function customersQueryKey(filter: ListCustomersParams) {
  return ["admin", "customers", "list", filter] as const;
}

export function useAdminCustomers(filter: ListCustomersParams) {
  const { withFreshToken } = useAdminAuth();

  const query = useQuery({
    queryKey: customersQueryKey(filter),
    queryFn: () => withFreshToken((token) => customersApi.listCustomers(filter, token)),
  });

  const error = query.error
    ? query.error instanceof ApiError && query.error.status === 403
      ? "You don't have permission to view customers."
      : "Couldn't load customers."
    : null;

  return {
    items: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    loading: query.isPending,
    error,
    refetch: query.refetch,
  };
}
