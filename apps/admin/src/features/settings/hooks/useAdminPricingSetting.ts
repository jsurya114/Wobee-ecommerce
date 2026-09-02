"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import * as settingsApi from "../api/admin-settings.client";

export const pricingSettingQueryKey = ["admin", "settings", "pricing"] as const;

export function useAdminPricingSetting() {
  const { withFreshToken } = useAdminAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: pricingSettingQueryKey,
    queryFn: () => withFreshToken((token) => settingsApi.getPricingSetting(token)),
  });

  const updateMutation = useMutation({
    mutationFn: (ratePerKgPaise: number) => withFreshToken((token) => settingsApi.updatePricingSetting(ratePerKgPaise, token)),
    onSuccess: (result) => {
      queryClient.setQueryData(pricingSettingQueryKey, result);
    },
  });

  const error = query.error
    ? query.error instanceof ApiError && query.error.status === 403
      ? "You don't have permission to view pricing settings."
      : "Couldn't load pricing settings."
    : null;

  return {
    setting: query.data?.setting ?? null,
    loading: query.isPending,
    error,
    refetch: query.refetch,
    updateRate: (ratePerKgPaise: number) => updateMutation.mutateAsync(ratePerKgPaise),
    isSaving: updateMutation.isPending,
  };
}
