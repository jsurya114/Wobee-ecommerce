"use client";

import { useQuery } from "@tanstack/react-query";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import * as couponsApi from "../api/admin-coupons.client";

export const couponsAdminQueryKey = ["admin", "coupons", "list"] as const;

export function useAdminCoupons() {
  const { withFreshToken } = useAdminAuth();

  const query = useQuery({
    queryKey: couponsAdminQueryKey,
    queryFn: () => withFreshToken((token) => couponsApi.listCouponsAdmin(token)),
  });

  const error = query.error
    ? query.error instanceof ApiError && query.error.status === 403
      ? "You don't have permission to view coupons."
      : "Couldn't load coupons."
    : null;

  return {
    items: query.data?.coupons ?? [],
    loading: query.isPending,
    error,
    refetch: query.refetch,
  };
}
