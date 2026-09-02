"use client";

import { useQuery } from "@tanstack/react-query";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { listCategories } from "../api/admin-categories.client";

export const categoriesQueryKey = ["admin", "categories"] as const;

export function useAdminCategories() {
  const { withFreshToken } = useAdminAuth();

  const query = useQuery({
    queryKey: categoriesQueryKey,
    queryFn: () => withFreshToken((token) => listCategories(token)),
  });

  return {
    categories: query.data?.categories ?? [],
    loading: query.isPending,
    error: query.error ? "Couldn't load categories." : null,
  };
}
