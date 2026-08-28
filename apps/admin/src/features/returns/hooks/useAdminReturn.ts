"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import * as returnsApi from "../api/admin-returns.client";
import type { AdminReturnDetailView, IssueRefundResult } from "../api/admin-returns.client";

export function useAdminReturn(returnId: string) {
  const { accessToken } = useAdminAuth();
  const [detail, setDetail] = useState<AdminReturnDetailView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefundOutcome, setLastRefundOutcome] = useState<IssueRefundResult["outcome"] | null>(null);

  const refetch = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      setDetail(await returnsApi.getReturn(returnId, accessToken));
    } catch {
      setError("Couldn't load this return.");
    } finally {
      setLoading(false);
    }
  }, [returnId, accessToken]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const requireToken = () => {
    if (!accessToken) throw new Error("Not authenticated");
    return accessToken;
  };

  return {
    detail,
    loading,
    error,
    lastRefundOutcome,
    refetch,
    approve: async () => {
      const updated = await returnsApi.approve(returnId, requireToken());
      setDetail((prev) => (prev ? { ...prev, return: updated } : prev));
    },
    reject: async (input: { reason?: string }) => {
      const updated = await returnsApi.reject(returnId, input, requireToken());
      setDetail((prev) => (prev ? { ...prev, return: updated } : prev));
    },
    issueRefund: async () => {
      const result = await returnsApi.issueRefund(returnId, requireToken());
      setDetail((prev) => (prev ? { ...prev, return: result.return } : prev));
      setLastRefundOutcome(result.outcome);
    },
    markRefunded: async () => {
      const updated = await returnsApi.markRefunded(returnId, requireToken());
      setDetail((prev) => (prev ? { ...prev, return: updated } : prev));
    },
  };
}
