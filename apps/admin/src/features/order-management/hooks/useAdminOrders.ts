"use client";

import { useQuery } from "@tanstack/react-query";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import * as ordersApi from "../api/admin-orders.client";
import type { ListOrdersParams } from "../api/admin-orders.client";

export function ordersQueryKey(filter: ListOrdersParams) {
  return ["admin", "orders", "list", filter] as const;
}

export function useAdminOrders(filter: ListOrdersParams) {
  const { withFreshToken } = useAdminAuth();

  const query = useQuery({
    queryKey: ordersQueryKey(filter),
    queryFn: () => withFreshToken((token) => ordersApi.listOrders(filter, token)),
  });

  // A role with no MANAGE_ORDERS permission (product_management_staff) gets a
  // real 403 here, not a network/server failure — caught live checking the
  // admin side: it read as an opaque, alarming "Couldn't load orders." for a
  // role that was never supposed to see this page in the first place.
  const error = query.error
    ? query.error instanceof ApiError && query.error.status === 403
      ? "You don't have permission to view orders."
      : "Couldn't load orders."
    : null;

  return {
    items: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    loading: query.isPending,
    error,
    refetch: query.refetch,
  };
}
