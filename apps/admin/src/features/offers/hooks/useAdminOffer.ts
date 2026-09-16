"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import * as offersApi from "../api/admin-offers.client";
import type { OfferPayload } from "../api/admin-offers.client";
import { offersAdminQueryKey } from "./useAdminOffers";

export function offerQueryKey(offerId: string) {
  return ["admin", "offers", "detail", offerId] as const;
}

export function useAdminOffer(offerId: string) {
  const { withFreshToken } = useAdminAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: offerQueryKey(offerId),
    queryFn: () => withFreshToken((token) => offersApi.getOffer(offerId, token)),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: offerQueryKey(offerId) });
    void queryClient.invalidateQueries({ queryKey: offersAdminQueryKey });
  };

  const updateMutation = useMutation({
    mutationFn: (input: Partial<OfferPayload>) => withFreshToken((token) => offersApi.updateOffer(offerId, input, token)),
    onSuccess: (result) => {
      queryClient.setQueryData(offerQueryKey(offerId), result);
      invalidate();
    },
  });

  const setActiveMutation = useMutation({
    mutationFn: (isActive: boolean) => withFreshToken((token) => offersApi.setOfferActive(offerId, isActive, token)),
    onSuccess: (result) => {
      queryClient.setQueryData(offerQueryKey(offerId), result);
      invalidate();
    },
  });

  const error = query.error ? (query.error instanceof ApiError ? query.error.message : "Couldn't load this offer.") : null;

  return {
    offer: query.data?.offer ?? null,
    loading: query.isPending,
    error,
    refetch: query.refetch,
    update: async (input: Partial<OfferPayload>) => {
      await updateMutation.mutateAsync(input);
    },
    setActive: async (isActive: boolean) => {
      await setActiveMutation.mutateAsync(isActive);
    },
  };
}
