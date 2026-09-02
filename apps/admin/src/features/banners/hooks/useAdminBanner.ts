"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import * as bannersApi from "../api/admin-banners.client";
import type { BannerPayload } from "../api/admin-banners.client";
import { bannersQueryKey } from "./useAdminBanners";

export function bannerQueryKey(bannerId: string) {
  return ["admin", "banners", bannerId] as const;
}

export function useAdminBanner(bannerId: string) {
  const { withFreshToken } = useAdminAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: bannerQueryKey(bannerId),
    queryFn: () => withFreshToken((token) => bannersApi.getBanner(bannerId, token)),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: bannerQueryKey(bannerId) });
    void queryClient.invalidateQueries({ queryKey: bannersQueryKey });
  };

  const updateMutation = useMutation({
    mutationFn: (input: Partial<BannerPayload>) => withFreshToken((token) => bannersApi.updateBanner(bannerId, input, token)),
    onSuccess: (result) => {
      queryClient.setQueryData(bannerQueryKey(bannerId), result);
      invalidate();
    },
  });

  const setActiveMutation = useMutation({
    mutationFn: (isActive: boolean) => withFreshToken((token) => bannersApi.setBannerActive(bannerId, isActive, token)),
    onSuccess: (result) => {
      queryClient.setQueryData(bannerQueryKey(bannerId), result);
      invalidate();
    },
  });

  const error = query.error
    ? query.error instanceof ApiError
      ? query.error.message
      : "Couldn't load this banner."
    : null;

  return {
    banner: query.data?.banner ?? null,
    loading: query.isPending,
    error,
    refetch: query.refetch,
    update: (input: Partial<BannerPayload>) => updateMutation.mutateAsync(input),
    setActive: (isActive: boolean) => setActiveMutation.mutateAsync(isActive),
  };
}
