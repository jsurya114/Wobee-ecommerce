"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import * as bannersApi from "../api/admin-banners.client";

export const bannersQueryKey = ["admin", "banners"] as const;

export function useAdminBanners() {
  const { withFreshToken } = useAdminAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: bannersQueryKey,
    queryFn: () => withFreshToken((token) => bannersApi.listBanners(token)),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: bannersQueryKey });

  const setActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      withFreshToken((token) => bannersApi.setBannerActive(id, isActive, token)),
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => withFreshToken((token) => bannersApi.deleteBanner(id, token)),
    onSuccess: invalidate,
  });

  const reorderMutation = useMutation({
    mutationFn: (bannerIds: string[]) => withFreshToken((token) => bannersApi.reorderBanners(bannerIds, token)),
    onSuccess: invalidate,
  });

  const error = query.error
    ? query.error instanceof ApiError && query.error.status === 403
      ? "You don't have permission to view banners."
      : query.error instanceof ApiError
        ? query.error.message
        : "Couldn't load banners."
    : null;

  return {
    items: query.data?.banners ?? [],
    loading: query.isPending,
    error,
    refetch: query.refetch,
    setActive: async (id: string, isActive: boolean) => {
      await setActiveMutation.mutateAsync({ id, isActive });
    },
    remove: async (id: string) => {
      await removeMutation.mutateAsync(id);
    },
    reorder: async (bannerIds: string[]) => {
      await reorderMutation.mutateAsync(bannerIds);
    },
  };
}
