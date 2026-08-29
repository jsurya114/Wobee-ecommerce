"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import * as customersApi from "../api/admin-customers.client";
import type { AdminCustomerDetail } from "../api/admin-customers.client";

export function useAdminCustomer(customerId: string) {
  const { accessToken } = useAdminAuth();
  const [detail, setDetail] = useState<AdminCustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      setDetail(await customersApi.getCustomer(customerId, accessToken));
    } catch {
      setError("Couldn't load this customer.");
    } finally {
      setLoading(false);
    }
  }, [customerId, accessToken]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return {
    detail,
    loading,
    error,
    refetch,
    setActive: async (isActive: boolean) => {
      if (!accessToken) throw new Error("Not authenticated");
      const result = await customersApi.setCustomerActive(customerId, isActive, accessToken);
      setDetail((prev) => (prev ? { ...prev, customer: result.customer } : prev));
    },
  };
}
