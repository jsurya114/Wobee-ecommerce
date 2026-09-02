"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { getProduct } from "@/features/products/api/admin-products.client";
import type { AdminProductDetail } from "@/features/products/api/admin-products.client";
import * as collectionsApi from "../api/admin-collections.client";
import type { AdminCollectionDetail } from "../api/admin-collections.client";
import { collectionsQueryKey } from "./useAdminCollections";

export function collectionQueryKey(collectionId: string) {
  return ["admin", "collections", "detail", collectionId] as const;
}

export function useAdminCollection(collectionId: string) {
  const { withFreshToken } = useAdminAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: collectionQueryKey(collectionId),
    queryFn: () =>
      withFreshToken(async (token) => {
        const result = await collectionsApi.getCollection(collectionId, token);
        // One call per assigned product — collections hold a small, curated
        // set (a handful to a few dozen), not a full catalogue page, so this
        // stays well short of anything worth a dedicated batch endpoint for.
        const products = await Promise.all(result.collection.productIds.map((id) => getProduct(id, token).then((r) => r.product)));
        // Preserve the collection's own admin-controlled order (productIds),
        // not whatever order Promise.all's results happen to resolve in.
        const byId = new Map(products.map((p) => [p.id, p]));
        const assignedProducts = result.collection.productIds
          .map((id) => byId.get(id))
          .filter((p): p is AdminProductDetail => Boolean(p));
        return { collection: result.collection, assignedProducts };
      }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: collectionQueryKey(collectionId) });
    void queryClient.invalidateQueries({ queryKey: collectionsQueryKey });
  };

  const updateMutation = useMutation({
    mutationFn: (input: Partial<collectionsApi.CollectionPayload>) => withFreshToken((token) => collectionsApi.updateCollection(collectionId, input, token)),
    onSuccess: (result) => {
      queryClient.setQueryData<{ collection: AdminCollectionDetail; assignedProducts: AdminProductDetail[] }>(collectionQueryKey(collectionId), (prev) =>
        prev ? { ...prev, collection: { ...prev.collection, ...result.collection } } : prev,
      );
      invalidate();
    },
  });

  const setActiveMutation = useMutation({
    mutationFn: (isActive: boolean) => withFreshToken((token) => collectionsApi.setCollectionActive(collectionId, isActive, token)),
    onSuccess: (result) => {
      queryClient.setQueryData<{ collection: AdminCollectionDetail; assignedProducts: AdminProductDetail[] }>(collectionQueryKey(collectionId), (prev) =>
        prev ? { ...prev, collection: { ...prev.collection, ...result.collection } } : prev,
      );
      invalidate();
    },
  });

  const assignProductMutation = useMutation({
    mutationFn: (productId: string) => withFreshToken((token) => collectionsApi.assignProduct(collectionId, productId, token)),
    onSuccess: invalidate,
  });

  const removeProductMutation = useMutation({
    mutationFn: (productId: string) => withFreshToken((token) => collectionsApi.removeProduct(collectionId, productId, token)),
    onSuccess: invalidate,
  });

  const reorderProductsMutation = useMutation({
    mutationFn: (productIds: string[]) => withFreshToken((token) => collectionsApi.reorderProducts(collectionId, productIds, token)),
    onSuccess: invalidate,
  });

  return {
    collection: query.data?.collection ?? null,
    assignedProducts: query.data?.assignedProducts ?? [],
    loading: query.isPending,
    error: query.error ? "Couldn't load this collection." : null,
    refetch: query.refetch,
    update: (input: Partial<collectionsApi.CollectionPayload>) => updateMutation.mutateAsync(input),
    setActive: (isActive: boolean) => setActiveMutation.mutateAsync(isActive),
    assignProduct: (productId: string) => assignProductMutation.mutateAsync(productId),
    removeProduct: (productId: string) => removeProductMutation.mutateAsync(productId),
    reorderProducts: (productIds: string[]) => reorderProductsMutation.mutateAsync(productIds),
  };
}
