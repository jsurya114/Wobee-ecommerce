"use client";

import { useQuery } from "@tanstack/react-query";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import * as collectionsApi from "../api/admin-collections.client";

export const collectionsQueryKey = ["admin", "collections", "list"] as const;

export function useAdminCollections() {
  const { withFreshToken } = useAdminAuth();

  const query = useQuery({
    queryKey: collectionsQueryKey,
    queryFn: () => withFreshToken((token) => collectionsApi.listCollections(token)),
  });

  const error = query.error
    ? query.error instanceof ApiError && query.error.status === 403
      ? "You don't have permission to view collections."
      : "Couldn't load collections."
    : null;

  return { items: query.data?.collections ?? [], loading: query.isPending, error, refetch: query.refetch };
}
