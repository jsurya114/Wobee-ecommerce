"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import * as testimonialsApi from "../api/admin-testimonials.client";
import type { ListAdminTestimonialsParams } from "../api/admin-testimonials.client";

export function testimonialsQueryKey(filter: ListAdminTestimonialsParams) {
  return ["admin", "testimonials", "list", filter] as const;
}

export function useAdminTestimonials(filter: ListAdminTestimonialsParams) {
  const { withFreshToken } = useAdminAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: testimonialsQueryKey(filter),
    queryFn: () => withFreshToken((token) => testimonialsApi.listTestimonials(filter, token)),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["admin", "testimonials", "list"] });

  const approveMutation = useMutation({
    mutationFn: (id: string) => withFreshToken((token) => testimonialsApi.approve(id, token)),
    onSuccess: invalidate,
  });
  const rejectMutation = useMutation({
    mutationFn: (id: string) => withFreshToken((token) => testimonialsApi.reject(id, token)),
    onSuccess: invalidate,
  });

  const error = query.error
    ? query.error instanceof ApiError && query.error.status === 403
      ? "You don't have permission to view testimonials."
      : "Couldn't load testimonials."
    : null;

  return {
    items: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    loading: query.isPending,
    error,
    refetch: query.refetch,
    approve: (id: string) => approveMutation.mutateAsync(id),
    reject: (id: string) => rejectMutation.mutateAsync(id),
    isModerating: approveMutation.isPending || rejectMutation.isPending,
  };
}
