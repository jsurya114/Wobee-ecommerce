"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import * as productsApi from "../api/admin-products.client";
import type { AdminProductSummary, ListProductsParams } from "../api/admin-products.client";

export function useAdminProducts(filter: ListProductsParams) {
  const { accessToken } = useAdminAuth();
  const [items, setItems] = useState<AdminProductSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const result = await productsApi.listProducts(filter, accessToken);
      setItems(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 403 ? "You don't have permission to view products." : "Couldn't load products.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, filter.search, filter.categoryId, filter.isActive, filter.page, filter.pageSize]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { items, total, loading, error, refetch };
}
