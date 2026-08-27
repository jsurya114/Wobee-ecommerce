"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import * as ordersApi from "../api/admin-orders.client";
import type { AdminOrderSummaryView, ListOrdersParams } from "../api/admin-orders.client";

export function useAdminOrders(filter: ListOrdersParams) {
  const { accessToken } = useAdminAuth();
  const [items, setItems] = useState<AdminOrderSummaryView[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const result = await ordersApi.listOrders(filter, accessToken);
      setItems(result.items);
      setTotal(result.total);
    } catch {
      setError("Couldn't load orders.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, filter.status, filter.search, filter.page, filter.pageSize]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { items, total, loading, error, refetch };
}
