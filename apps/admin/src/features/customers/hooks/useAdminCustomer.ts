"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import * as customersApi from "../api/admin-customers.client";
import type { AdminCustomerDetail } from "../api/admin-customers.client";

export function customerQueryKey(customerId: string) {
  return ["admin", "customers", "detail", customerId] as const;
}

export function useAdminCustomer(customerId: string) {
  const { withFreshToken } = useAdminAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: customerQueryKey(customerId),
    queryFn: () => withFreshToken((token) => customersApi.getCustomer(customerId, token)),
  });

  const setActiveMutation = useMutation({
    mutationFn: (isActive: boolean) => withFreshToken((token) => customersApi.setCustomerActive(customerId, isActive, token)),
    onSuccess: (result) => {
      queryClient.setQueryData<AdminCustomerDetail>(customerQueryKey(customerId), (prev) => (prev ? { ...prev, customer: result.customer } : prev));
      void queryClient.invalidateQueries({ queryKey: ["admin", "customers", "list"] });
    },
  });

  const error = query.error ? (query.error instanceof ApiError ? query.error.message : "Couldn't load this customer.") : null;

  return {
    detail: query.data ?? null,
    loading: query.isPending,
    error,
    refetch: query.refetch,
    setActive: (isActive: boolean) => setActiveMutation.mutateAsync(isActive),
  };
}
