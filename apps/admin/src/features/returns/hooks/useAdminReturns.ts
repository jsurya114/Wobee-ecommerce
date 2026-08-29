"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import * as returnsApi from "../api/admin-returns.client";
import type { AdminReturnSummaryView, ListReturnsParams } from "../api/admin-returns.client";

export function useAdminReturns(filter: ListReturnsParams) {
  const { accessToken } = useAdminAuth();
  const [items, setItems] = useState<AdminReturnSummaryView[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const result = await returnsApi.listReturns(filter, accessToken);
      setItems(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 403 ? "You don't have permission to view returns." : "Couldn't load returns.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, filter.status, filter.orderId, filter.page, filter.pageSize]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { items, total, loading, error, refetch };
}
