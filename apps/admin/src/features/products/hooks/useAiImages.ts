"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import * as aiApi from "../api/admin-ai-images.client";
import type { AiImageAngle } from "../api/admin-ai-images.client";
import { productQueryKey } from "./useAdminProduct";

const IN_FLIGHT = new Set(["PENDING", "PROCESSING"]);

export function useAiImages(productId: string) {
  const { withFreshToken } = useAdminAuth();
  const queryClient = useQueryClient();
  const key = ["admin", "ai-images", productId] as const;

  const query = useQuery({
    queryKey: key,
    queryFn: () => withFreshToken((token) => aiApi.listAiGenerations(productId, token)),
    // Poll only while something is still generating; idle tabs make no requests.
    refetchInterval: (q) => (q.state.data?.generations.some((g) => g.images.some((i) => IN_FLIGHT.has(i.status))) ? 4000 : false),
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: key });

  const generate = useMutation({
    mutationFn: ({ sourceMediaId, angles }: { sourceMediaId: string; angles: AiImageAngle[] }) =>
      withFreshToken((token) => aiApi.requestAiImages(productId, sourceMediaId, angles, token)),
    onSuccess: refresh,
  });
  const approve = useMutation({
    mutationFn: (id: string) => withFreshToken((token) => aiApi.approveAiImage(id, token)),
    onSuccess: () => {
      refresh();
      // The approved image is now a normal product image: refresh the gallery above.
      void queryClient.invalidateQueries({ queryKey: productQueryKey(productId) });
    },
  });
  const reject = useMutation({ mutationFn: (id: string) => withFreshToken((token) => aiApi.rejectAiImage(id, token)), onSuccess: refresh });
  const regenerate = useMutation({ mutationFn: (id: string) => withFreshToken((token) => aiApi.regenerateAiImage(id, token)), onSuccess: refresh });

  return {
    generations: query.data?.generations ?? [],
    loading: query.isPending,
    generate: (sourceMediaId: string, angles: AiImageAngle[]) => generate.mutateAsync({ sourceMediaId, angles }),
    approve: (id: string) => approve.mutateAsync(id),
    reject: (id: string) => reject.mutateAsync(id),
    regenerate: (id: string) => regenerate.mutateAsync(id),
  };
}
