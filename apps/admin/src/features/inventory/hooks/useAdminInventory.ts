"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import * as inventoryApi from "../api/admin-inventory.client";
import type { ListInventoryParams } from "../api/admin-inventory.client";

export function inventoryQueryKey(filter: ListInventoryParams) {
  return ["admin", "inventory", filter] as const;
}

export function useAdminInventory(filter: ListInventoryParams) {
  const { withFreshToken } = useAdminAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: inventoryQueryKey(filter),
    queryFn: () => withFreshToken((token) => inventoryApi.listInventory(filter, token)),
  });

  const adjustMutation = useMutation({
    mutationFn: ({ variantId, delta, reason }: { variantId: string; delta: number; reason: string }) =>
      withFreshToken((token) => inventoryApi.adjustInventory(variantId, delta, reason, token)),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin", "inventory"] }),
  });

  const error = query.error
    ? query.error instanceof ApiError && query.error.status === 403
      ? "You don't have permission to view inventory."
      : "Couldn't load inventory."
    : null;

  return {
    items: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    loading: query.isPending,
    error,
    refetch: query.refetch,
    adjust: async (variantId: string, delta: number, reason: string) => {
      await adjustMutation.mutateAsync({ variantId, delta, reason });
    },
  };
}
