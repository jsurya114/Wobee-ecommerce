"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import * as bannersApi from "../api/admin-banners.client";
import type { AdminBanner, BannerPayload } from "../api/admin-banners.client";

export function useAdminBanner(bannerId: string) {
  const { accessToken } = useAdminAuth();
  const [banner, setBanner] = useState<AdminBanner | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const result = await bannersApi.getBanner(bannerId, accessToken);
      setBanner(result.banner);
    } catch {
      setError("Couldn't load this banner.");
    } finally {
      setLoading(false);
    }
  }, [bannerId, accessToken]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const requireToken = () => {
    if (!accessToken) throw new Error("Not authenticated");
    return accessToken;
  };

  return {
    banner,
    loading,
    error,
    refetch,
    update: async (input: Partial<BannerPayload>) => {
      const result = await bannersApi.updateBanner(bannerId, input, requireToken());
      setBanner(result.banner);
    },
    setActive: async (isActive: boolean) => {
      const result = await bannersApi.setBannerActive(bannerId, isActive, requireToken());
      setBanner(result.banner);
    },
  };
}
