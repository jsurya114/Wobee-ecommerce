"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import * as couponsApi from "../api/admin-coupons.client";
import type { CouponPayload } from "../api/admin-coupons.client";
import { couponsAdminQueryKey } from "./useAdminCoupons";

export function couponQueryKey(couponId: string) {
  return ["admin", "coupons", "detail", couponId] as const;
}

export function useAdminCoupon(couponId: string) {
  const { withFreshToken } = useAdminAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: couponQueryKey(couponId),
    queryFn: () => withFreshToken((token) => couponsApi.getCoupon(couponId, token)),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: couponQueryKey(couponId) });
    void queryClient.invalidateQueries({ queryKey: couponsAdminQueryKey });
  };

  const updateMutation = useMutation({
    mutationFn: (input: Partial<CouponPayload>) => withFreshToken((token) => couponsApi.updateCoupon(couponId, input, token)),
    onSuccess: (result) => {
      queryClient.setQueryData(couponQueryKey(couponId), result);
      invalidate();
    },
  });

  const setActiveMutation = useMutation({
    mutationFn: (isActive: boolean) => withFreshToken((token) => couponsApi.setCouponActive(couponId, isActive, token)),
    onSuccess: (result) => {
      queryClient.setQueryData(couponQueryKey(couponId), result);
      invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => withFreshToken((token) => couponsApi.deleteCoupon(couponId, token)),
    onSuccess: () => invalidate(),
  });

  const error = query.error ? (query.error instanceof ApiError ? query.error.message : "Couldn't load this coupon.") : null;

  return {
    coupon: query.data?.coupon ?? null,
    loading: query.isPending,
    error,
    refetch: query.refetch,
    update: async (input: Partial<CouponPayload>) => {
      await updateMutation.mutateAsync(input);
    },
    setActive: async (isActive: boolean) => {
      await setActiveMutation.mutateAsync(isActive);
    },
    remove: async () => {
      await deleteMutation.mutateAsync();
    },
  };
}
