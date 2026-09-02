"use client";

import { useQuery } from "@tanstack/react-query";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import * as productsApi from "../api/admin-products.client";
import type { ListProductsParams } from "../api/admin-products.client";

export function productsQueryKey(filter: ListProductsParams) {
  return ["admin", "products", "list", filter] as const;
}

export function useAdminProducts(filter: ListProductsParams) {
  const { withFreshToken } = useAdminAuth();

  const query = useQuery({
    queryKey: productsQueryKey(filter),
    queryFn: () => withFreshToken((token) => productsApi.listProducts(filter, token)),
  });

  const error = query.error
    ? query.error instanceof ApiError && query.error.status === 403
      ? "You don't have permission to view products."
      : "Couldn't load products."
    : null;

  return {
    items: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    loading: query.isPending,
    error,
    refetch: query.refetch,
  };
}
