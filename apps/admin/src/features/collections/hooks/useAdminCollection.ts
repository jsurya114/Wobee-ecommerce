"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { getProduct } from "@/features/products/api/admin-products.client";
import type { AdminProductDetail } from "@/features/products/api/admin-products.client";
import * as collectionsApi from "../api/admin-collections.client";
import type { AdminCollectionDetail, CollectionPayload } from "../api/admin-collections.client";

export function useAdminCollection(collectionId: string) {
  const { accessToken } = useAdminAuth();
  const [collection, setCollection] = useState<AdminCollectionDetail | null>(null);
  const [assignedProducts, setAssignedProducts] = useState<AdminProductDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const result = await collectionsApi.getCollection(collectionId, accessToken);
      setCollection(result.collection);
      // One call per assigned product — collections hold a small, curated
      // set (a handful to a few dozen), not a full catalogue page, so this
      // stays well short of anything worth a dedicated batch endpoint for.
      const products = await Promise.all(result.collection.productIds.map((id) => getProduct(id, accessToken).then((r) => r.product)));
      // Preserve the collection's own admin-controlled order (productIds),
      // not whatever order Promise.all's results happen to resolve in.
      const byId = new Map(products.map((p) => [p.id, p]));
      setAssignedProducts(result.collection.productIds.map((id) => byId.get(id)).filter((p): p is AdminProductDetail => Boolean(p)));
    } catch {
      setError("Couldn't load this collection.");
    } finally {
      setLoading(false);
    }
  }, [collectionId, accessToken]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const requireToken = () => {
    if (!accessToken) throw new Error("Not authenticated");
    return accessToken;
  };

  return {
    collection,
    assignedProducts,
    loading,
    error,
    refetch,
    update: async (input: Partial<CollectionPayload>) => {
      const result = await collectionsApi.updateCollection(collectionId, input, requireToken());
      setCollection((prev) => (prev ? { ...prev, ...result.collection } : prev));
    },
    setActive: async (isActive: boolean) => {
      const result = await collectionsApi.setCollectionActive(collectionId, isActive, requireToken());
      setCollection((prev) => (prev ? { ...prev, ...result.collection } : prev));
    },
    assignProduct: async (productId: string) => {
      await collectionsApi.assignProduct(collectionId, productId, requireToken());
      await refetch();
    },
    removeProduct: async (productId: string) => {
      await collectionsApi.removeProduct(collectionId, productId, requireToken());
      await refetch();
    },
    reorderProducts: async (productIds: string[]) => {
      await collectionsApi.reorderProducts(collectionId, productIds, requireToken());
      await refetch();
    },
  };
}
