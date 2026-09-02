"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import * as categoriesApi from "../api/admin-categories.client";
import type { CategoryPayload } from "../api/admin-categories.client";
import { categoriesAdminQueryKey } from "./useAdminCategoriesAdmin";

export function categoryQueryKey(categoryId: string) {
  return ["admin", "categories", "detail", categoryId] as const;
}

export function useAdminCategory(categoryId: string) {
  const { withFreshToken } = useAdminAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: categoryQueryKey(categoryId),
    queryFn: () => withFreshToken((token) => categoriesApi.getCategory(categoryId, token)),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: categoryQueryKey(categoryId) });
    void queryClient.invalidateQueries({ queryKey: categoriesAdminQueryKey });
  };

  const updateMutation = useMutation({
    mutationFn: (input: Partial<CategoryPayload>) => withFreshToken((token) => categoriesApi.updateCategory(categoryId, input, token)),
    onSuccess: (result) => {
      queryClient.setQueryData(categoryQueryKey(categoryId), result);
      invalidate();
    },
  });

  const setActiveMutation = useMutation({
    mutationFn: (isActive: boolean) => withFreshToken((token) => categoriesApi.setCategoryActive(categoryId, isActive, token)),
    onSuccess: (result) => {
      queryClient.setQueryData(categoryQueryKey(categoryId), result);
      invalidate();
    },
  });

  const error = query.error ? (query.error instanceof ApiError ? query.error.message : "Couldn't load this category.") : null;

  return {
    category: query.data?.category ?? null,
    loading: query.isPending,
    error,
    refetch: query.refetch,
    update: async (input: Partial<CategoryPayload>) => {
      await updateMutation.mutateAsync(input);
    },
    setActive: async (isActive: boolean) => {
      await setActiveMutation.mutateAsync(isActive);
    },
  };
}
