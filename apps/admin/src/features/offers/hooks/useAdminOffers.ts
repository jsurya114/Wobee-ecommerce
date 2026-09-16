"use client";

import { useQuery } from "@tanstack/react-query";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import * as offersApi from "../api/admin-offers.client";

export const offersAdminQueryKey = ["admin", "offers", "list"] as const;

export function useAdminOffers() {
  const { withFreshToken } = useAdminAuth();

  const query = useQuery({
    queryKey: offersAdminQueryKey,
    queryFn: () => withFreshToken((token) => offersApi.listOffersAdmin(token)),
  });

  const error = query.error
    ? query.error instanceof ApiError && query.error.status === 403
      ? "You don't have permission to view offers."
      : "Couldn't load offers."
    : null;

  return {
    items: query.data?.offers ?? [],
    loading: query.isPending,
    error,
    refetch: query.refetch,
  };
}
