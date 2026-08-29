"use client";

import type { CancelOrderInput, ShipOrderInput } from "@woobe/validation";
import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import * as ordersApi from "../api/admin-orders.client";
import type { AdminOrderView } from "../api/admin-orders.client";

export function useAdminOrder(orderId: string) {
  const { accessToken } = useAdminAuth();
  const [order, setOrder] = useState<AdminOrderView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefundIssued, setLastRefundIssued] = useState<boolean | null>(null);

  const refetch = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      setOrder(await ordersApi.getOrder(orderId, accessToken));
    } catch {
      setError("Couldn't load this order.");
    } finally {
      setLoading(false);
    }
  }, [orderId, accessToken]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const requireToken = () => {
    if (!accessToken) throw new Error("Not authenticated");
    return accessToken;
  };

  return {
    order,
    loading,
    error,
    lastRefundIssued,
    refetch,
    startProcessing: async () => {
      setOrder(await ordersApi.startProcessing(orderId, requireToken()));
    },
    ship: async (input: ShipOrderInput) => {
      setOrder(await ordersApi.ship(orderId, input, requireToken()));
    },
    deliver: async () => {
      setOrder(await ordersApi.deliver(orderId, requireToken()));
    },
    cancel: async (input: CancelOrderInput) => {
      const result = await ordersApi.cancel(orderId, input, requireToken());
      setOrder(result.order);
      setLastRefundIssued(result.refundIssued);
    },
  };
}
