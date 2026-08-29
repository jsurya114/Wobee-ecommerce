"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import * as collectionsApi from "../api/admin-collections.client";
import type { AdminCollection } from "../api/admin-collections.client";

export function useAdminCollections() {
  const { accessToken } = useAdminAuth();
  const [items, setItems] = useState<AdminCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const result = await collectionsApi.listCollections(accessToken);
      setItems(result.collections);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 403 ? "You don't have permission to view collections." : "Couldn't load collections.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { items, loading, error, refetch };
}
