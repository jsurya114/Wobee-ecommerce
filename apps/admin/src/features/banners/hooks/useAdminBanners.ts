"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import * as bannersApi from "../api/admin-banners.client";
import type { AdminBanner } from "../api/admin-banners.client";

export function useAdminBanners() {
  const { accessToken } = useAdminAuth();
  const [items, setItems] = useState<AdminBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const result = await bannersApi.listBanners(accessToken);
      setItems(result.banners);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 403 ? "You don't have permission to view banners." : "Couldn't load banners.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const requireToken = () => {
    if (!accessToken) throw new Error("Not authenticated");
    return accessToken;
  };

  return {
    items,
    loading,
    error,
    refetch,
    setActive: async (id: string, isActive: boolean) => {
      await bannersApi.setBannerActive(id, isActive, requireToken());
      await refetch();
    },
    remove: async (id: string) => {
      await bannersApi.deleteBanner(id, requireToken());
      await refetch();
    },
    reorder: async (bannerIds: string[]) => {
      await bannersApi.reorderBanners(bannerIds, requireToken());
      await refetch();
    },
  };
}
