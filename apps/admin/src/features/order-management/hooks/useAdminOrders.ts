"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
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
    } catch (err) {
      // A role with no MANAGE_ORDERS permission (product_management_staff)
      // gets a real 403 here, not a network/server failure — caught live
      // checking the admin side: it read as an opaque, alarming "Couldn't
      // load orders." for a role that was never supposed to see this page
      // in the first place (nothing else exists for them to land on yet,
      // see LoginForm's own comment on the same finding).
      setError(err instanceof ApiError && err.status === 403 ? "You don't have permission to view orders." : "Couldn't load orders.");
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
