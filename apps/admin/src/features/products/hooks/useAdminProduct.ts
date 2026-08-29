"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import * as productsApi from "../api/admin-products.client";
import type { AdminProductDetail, UpdateProductPayload, UpdateVariantPayload, VariantPayload } from "../api/admin-products.client";

export function useAdminProduct(productId: string) {
  const { accessToken } = useAdminAuth();
  const [product, setProduct] = useState<AdminProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const result = await productsApi.getProduct(productId, accessToken);
      setProduct(result.product);
    } catch {
      setError("Couldn't load this product.");
    } finally {
      setLoading(false);
    }
  }, [productId, accessToken]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const requireToken = () => {
    if (!accessToken) throw new Error("Not authenticated");
    return accessToken;
  };

  return {
    product,
    loading,
    error,
    refetch,
    update: async (input: UpdateProductPayload) => {
      const result = await productsApi.updateProduct(productId, input, requireToken());
      setProduct(result.product);
    },
    setActive: async (isActive: boolean) => {
      const result = await productsApi.setProductActive(productId, isActive, requireToken());
      setProduct(result.product);
    },
    createVariant: async (input: VariantPayload) => {
      await productsApi.createVariant(productId, input, requireToken());
      await refetch();
    },
    updateVariant: async (variantId: string, input: UpdateVariantPayload) => {
      await productsApi.updateVariant(productId, variantId, input, requireToken());
      await refetch();
    },
    setVariantActive: async (variantId: string, isActive: boolean) => {
      await productsApi.setVariantActive(productId, variantId, isActive, requireToken());
      await refetch();
    },
    addImage: async (url: string, altText: string) => {
      await productsApi.addImage(productId, url, altText, requireToken());
      await refetch();
    },
    removeImage: async (imageId: string) => {
      await productsApi.removeImage(productId, imageId, requireToken());
      await refetch();
    },
    reorderImages: async (imageIds: string[]) => {
      await productsApi.reorderImages(productId, imageIds, requireToken());
      await refetch();
    },
  };
}
