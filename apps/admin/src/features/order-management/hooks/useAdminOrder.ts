"use client";

import type { CancelOrderInput, ShipOrderInput } from "@woobe/validation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import * as ordersApi from "../api/admin-orders.client";

export function orderQueryKey(orderId: string) {
  return ["admin", "orders", "detail", orderId] as const;
}

export function useAdminOrder(orderId: string) {
  const { withFreshToken } = useAdminAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: orderQueryKey(orderId),
    queryFn: () => withFreshToken((token) => ordersApi.getOrder(orderId, token)),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: orderQueryKey(orderId) });
    void queryClient.invalidateQueries({ queryKey: ["admin", "orders", "list"] });
  };

  const startProcessingMutation = useMutation({
    mutationFn: () => withFreshToken((token) => ordersApi.startProcessing(orderId, token)),
    onSuccess: (order) => {
      queryClient.setQueryData(orderQueryKey(orderId), order);
      invalidate();
    },
  });

  const shipMutation = useMutation({
    mutationFn: (input: ShipOrderInput) => withFreshToken((token) => ordersApi.ship(orderId, input, token)),
    onSuccess: (order) => {
      queryClient.setQueryData(orderQueryKey(orderId), order);
      invalidate();
    },
  });

  const deliverMutation = useMutation({
    mutationFn: () => withFreshToken((token) => ordersApi.deliver(orderId, token)),
    onSuccess: (order) => {
      queryClient.setQueryData(orderQueryKey(orderId), order);
      invalidate();
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (input: CancelOrderInput) => withFreshToken((token) => ordersApi.cancel(orderId, input, token)),
    onSuccess: (result) => {
      queryClient.setQueryData(orderQueryKey(orderId), result.order);
      invalidate();
    },
  });

  return {
    order: query.data ?? null,
    loading: query.isPending,
    error: query.error ? "Couldn't load this order." : null,
    lastRefundIssued: cancelMutation.data?.refundIssued ?? null,
    refetch: query.refetch,
    startProcessing: async () => {
      await startProcessingMutation.mutateAsync();
    },
    ship: async (input: ShipOrderInput) => {
      await shipMutation.mutateAsync(input);
    },
    deliver: async () => {
      await deliverMutation.mutateAsync();
    },
    cancel: async (input: CancelOrderInput) => {
      await cancelMutation.mutateAsync(input);
    },
  };
}
