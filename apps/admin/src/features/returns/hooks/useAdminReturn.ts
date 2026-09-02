"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import * as returnsApi from "../api/admin-returns.client";

export function returnQueryKey(returnId: string) {
  return ["admin", "returns", "detail", returnId] as const;
}

export function useAdminReturn(returnId: string) {
  const { withFreshToken } = useAdminAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: returnQueryKey(returnId),
    queryFn: () => withFreshToken((token) => returnsApi.getReturn(returnId, token)),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: returnQueryKey(returnId) });
    void queryClient.invalidateQueries({ queryKey: ["admin", "returns", "list"] });
  };

  const setDetailReturn = (updated: Awaited<ReturnType<typeof returnsApi.approve>>) => {
    queryClient.setQueryData(returnQueryKey(returnId), (prev: Awaited<ReturnType<typeof returnsApi.getReturn>> | undefined) =>
      prev ? { ...prev, return: updated } : prev,
    );
  };

  const approveMutation = useMutation({
    mutationFn: () => withFreshToken((token) => returnsApi.approve(returnId, token)),
    onSuccess: (updated) => {
      setDetailReturn(updated);
      invalidate();
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (input: { reason?: string }) => withFreshToken((token) => returnsApi.reject(returnId, input, token)),
    onSuccess: (updated) => {
      setDetailReturn(updated);
      invalidate();
    },
  });

  const issueRefundMutation = useMutation({
    mutationFn: () => withFreshToken((token) => returnsApi.issueRefund(returnId, token)),
    onSuccess: (result) => {
      setDetailReturn(result.return);
      invalidate();
    },
  });

  const markRefundedMutation = useMutation({
    mutationFn: () => withFreshToken((token) => returnsApi.markRefunded(returnId, token)),
    onSuccess: (updated) => {
      setDetailReturn(updated);
      invalidate();
    },
  });

  return {
    detail: query.data ?? null,
    loading: query.isPending,
    error: query.error ? "Couldn't load this return." : null,
    lastRefundOutcome: issueRefundMutation.data?.outcome ?? null,
    refetch: query.refetch,
    approve: async () => {
      await approveMutation.mutateAsync();
    },
    reject: async (input: { reason?: string }) => {
      await rejectMutation.mutateAsync(input);
    },
    issueRefund: async () => {
      await issueRefundMutation.mutateAsync();
    },
    markRefunded: async () => {
      await markRefundedMutation.mutateAsync();
    },
  };
}
