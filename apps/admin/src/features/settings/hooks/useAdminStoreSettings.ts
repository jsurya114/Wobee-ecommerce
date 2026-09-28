"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import * as settingsApi from "../api/admin-settings.client";
import { publicAppConfigQueryKey } from "./usePublicAppConfig";

export const appConfigQueryKey = ["admin", "settings", "config"] as const;
export const shippingRuleQueryKey = ["admin", "settings", "shipping"] as const;

function loadError(error: unknown, what: string): string | null {
  if (!error) return null;
  return error instanceof ApiError && error.status === 403 ? `You don't have permission to view ${what}.` : `Couldn't load ${what}.`;
}

/** Store settings (AppConfig). Saving also refreshes the public-config cache the rest of the admin reads presets/flags from. */
export function useAdminAppConfig() {
  const { withFreshToken } = useAdminAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: appConfigQueryKey,
    queryFn: () => withFreshToken((token) => settingsApi.getAppConfig(token)),
  });

  const updateMutation = useMutation({
    mutationFn: (patch: settingsApi.AppConfigPatch) => withFreshToken((token) => settingsApi.updateAppConfig(patch, token)),
    onSuccess: (result) => {
      queryClient.setQueryData(appConfigQueryKey, result);
      void queryClient.invalidateQueries({ queryKey: publicAppConfigQueryKey });
    },
  });

  return {
    config: query.data?.config ?? null,
    loading: query.isPending,
    error: loadError(query.error, "store settings"),
    update: (patch: settingsApi.AppConfigPatch) => updateMutation.mutateAsync(patch),
    isSaving: updateMutation.isPending,
  };
}

/** Cart & shipping rules (ShippingRule — each save is a new versioned row server-side). */
export function useAdminShippingRule() {
  const { withFreshToken } = useAdminAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: shippingRuleQueryKey,
    queryFn: () => withFreshToken((token) => settingsApi.getShippingRule(token)),
  });

  const updateMutation = useMutation({
    mutationFn: (patch: settingsApi.ShippingRulePatch) => withFreshToken((token) => settingsApi.updateShippingRule(patch, token)),
    onSuccess: (result) => {
      queryClient.setQueryData(shippingRuleQueryKey, result);
      void queryClient.invalidateQueries({ queryKey: publicAppConfigQueryKey });
    },
  });

  return {
    rule: query.data?.rule ?? null,
    loading: query.isPending,
    error: loadError(query.error, "shipping rules"),
    update: (patch: settingsApi.ShippingRulePatch) => updateMutation.mutateAsync(patch),
    isSaving: updateMutation.isPending,
  };
}
