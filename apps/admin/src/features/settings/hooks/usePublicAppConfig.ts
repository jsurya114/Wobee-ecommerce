"use client";

import { useQuery } from "@tanstack/react-query";
import { getPublicAppConfig } from "../api/admin-settings.client";

export const publicAppConfigQueryKey = ["settings", "public-config"] as const;

/**
 * The public settings subset (presets, returns flag, cart minimums) — no auth
 * needed, so catalog staff (who lack MANAGE_SETTINGS) can still read the size /
 * fabric / fit presets their variant form offers.
 */
export function usePublicAppConfig() {
  const query = useQuery({
    queryKey: publicAppConfigQueryKey,
    queryFn: getPublicAppConfig,
    staleTime: 60_000,
  });
  return {
    config: query.data?.config ?? null,
    loading: query.isPending,
    error: query.error ? "Couldn't load store settings." : null,
  };
}
