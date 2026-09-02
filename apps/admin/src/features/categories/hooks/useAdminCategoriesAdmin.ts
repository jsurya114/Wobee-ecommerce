"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import * as categoriesApi from "../api/admin-categories.client";

export const categoriesAdminQueryKey = ["admin", "categories", "list"] as const;

/** The admin management list (all categories, incl. inactive, with product counts) — distinct from products' useAdminCategories (active-only dropdown source). */
export function useAdminCategoriesAdmin() {
  const { withFreshToken } = useAdminAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: categoriesAdminQueryKey,
    queryFn: () => withFreshToken((token) => categoriesApi.listCategoriesAdmin(token)),
  });

  const reorderMutation = useMutation({
    mutationFn: (categoryIds: string[]) => withFreshToken((token) => categoriesApi.reorderCategories(categoryIds, token)),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: categoriesAdminQueryKey }),
  });

  const error = query.error
    ? query.error instanceof ApiError && query.error.status === 403
      ? "You don't have permission to view categories."
      : "Couldn't load categories."
    : null;

  return {
    items: query.data?.categories ?? [],
    loading: query.isPending,
    error,
    refetch: query.refetch,
    reorder: async (categoryIds: string[]) => {
      await reorderMutation.mutateAsync(categoryIds);
    },
  };
}
