"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import * as customersApi from "../api/admin-customers.client";
import type { AdminCustomerSummary, ListCustomersParams } from "../api/admin-customers.client";

export function useAdminCustomers(filter: ListCustomersParams) {
  const { accessToken } = useAdminAuth();
  const [items, setItems] = useState<AdminCustomerSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const result = await customersApi.listCustomers(filter, accessToken);
      setItems(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 403 ? "You don't have permission to view customers." : "Couldn't load customers.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, filter.search, filter.isActive, filter.page, filter.pageSize]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { items, total, loading, error, refetch };
}
