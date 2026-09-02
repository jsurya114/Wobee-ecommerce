"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import * as productsApi from "../api/admin-products.client";
import type { UpdateProductPayload, UpdateVariantPayload, VariantPayload } from "../api/admin-products.client";

export function productQueryKey(productId: string) {
  return ["admin", "products", "detail", productId] as const;
}

export function useAdminProduct(productId: string) {
  const { withFreshToken } = useAdminAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: productQueryKey(productId),
    queryFn: () => withFreshToken((token) => productsApi.getProduct(productId, token)),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: productQueryKey(productId) });
    void queryClient.invalidateQueries({ queryKey: ["admin", "products", "list"] });
  };

  const updateMutation = useMutation({
    mutationFn: (input: UpdateProductPayload) => withFreshToken((token) => productsApi.updateProduct(productId, input, token)),
    onSuccess: (result) => {
      queryClient.setQueryData(productQueryKey(productId), result);
      invalidate();
    },
  });

  const setActiveMutation = useMutation({
    mutationFn: (isActive: boolean) => withFreshToken((token) => productsApi.setProductActive(productId, isActive, token)),
    onSuccess: (result) => {
      queryClient.setQueryData(productQueryKey(productId), result);
      invalidate();
    },
  });

  const createVariantMutation = useMutation({
    mutationFn: (input: VariantPayload) => withFreshToken((token) => productsApi.createVariant(productId, input, token)),
    onSuccess: invalidate,
  });

  const updateVariantMutation = useMutation({
    mutationFn: ({ variantId, input }: { variantId: string; input: UpdateVariantPayload }) =>
      withFreshToken((token) => productsApi.updateVariant(productId, variantId, input, token)),
    onSuccess: invalidate,
  });

  const setVariantActiveMutation = useMutation({
    mutationFn: ({ variantId, isActive }: { variantId: string; isActive: boolean }) =>
      withFreshToken((token) => productsApi.setVariantActive(productId, variantId, isActive, token)),
    onSuccess: invalidate,
  });

  const addImageMutation = useMutation({
    mutationFn: ({ url, altText }: { url: string; altText: string }) => withFreshToken((token) => productsApi.addImage(productId, url, altText, token)),
    onSuccess: invalidate,
  });

  const removeImageMutation = useMutation({
    mutationFn: (imageId: string) => withFreshToken((token) => productsApi.removeImage(productId, imageId, token)),
    onSuccess: invalidate,
  });

  const reorderImagesMutation = useMutation({
    mutationFn: (imageIds: string[]) => withFreshToken((token) => productsApi.reorderImages(productId, imageIds, token)),
    onSuccess: invalidate,
  });

  return {
    product: query.data?.product ?? null,
    loading: query.isPending,
    error: query.error ? "Couldn't load this product." : null,
    refetch: query.refetch,
    update: async (input: UpdateProductPayload) => {
      await updateMutation.mutateAsync(input);
    },
    setActive: async (isActive: boolean) => {
      await setActiveMutation.mutateAsync(isActive);
    },
    createVariant: async (input: VariantPayload) => {
      await createVariantMutation.mutateAsync(input);
    },
    updateVariant: async (variantId: string, input: UpdateVariantPayload) => {
      await updateVariantMutation.mutateAsync({ variantId, input });
    },
    setVariantActive: async (variantId: string, isActive: boolean) => {
      await setVariantActiveMutation.mutateAsync({ variantId, isActive });
    },
    addImage: async (url: string, altText: string) => {
      await addImageMutation.mutateAsync({ url, altText });
    },
    removeImage: async (imageId: string) => {
      await removeImageMutation.mutateAsync(imageId);
    },
    reorderImages: async (imageIds: string[]) => {
      await reorderImagesMutation.mutateAsync(imageIds);
    },
  };
}
