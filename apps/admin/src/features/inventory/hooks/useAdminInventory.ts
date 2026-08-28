"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import * as inventoryApi from "../api/admin-inventory.client";
import type { AdminInventoryRow, ListInventoryParams } from "../api/admin-inventory.client";

export function useAdminInventory(filter: ListInventoryParams) {
  const { accessToken } = useAdminAuth();
  const [items, setItems] = useState<AdminInventoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const result = await inventoryApi.listInventory(filter, accessToken);
      setItems(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 403 ? "You don't have permission to view inventory." : "Couldn't load inventory.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, filter.search, filter.lowStockOnly, filter.outOfStockOnly, filter.page, filter.pageSize]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const requireToken = () => {
    if (!accessToken) throw new Error("Not authenticated");
    return accessToken;
  };

  return {
    items,
    total,
    loading,
    error,
    refetch,
    adjust: async (variantId: string, delta: number, reason: string) => {
      await inventoryApi.adjustInventory(variantId, delta, reason, requireToken());
      await refetch();
    },
  };
}
