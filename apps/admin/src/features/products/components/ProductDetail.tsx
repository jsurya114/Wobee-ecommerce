"use client";

import { Badge, Button, Card } from "@woobe/ui";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import { listCategories } from "../api/admin-categories.client";
import type { CategoryOption } from "../api/admin-categories.client";
import { useAdminProduct } from "../hooks/useAdminProduct";
import { ProductForm } from "./ProductForm";
import { ProductImages } from "./ProductImages";
import { VariantsList } from "./VariantsList";

export function ProductDetail({ productId }: { productId: string }) {
  const { accessToken } = useAdminAuth();
  const { product, loading, error, update, setActive, createVariant, updateVariant, setVariantActive, addImage, removeImage, reorderImages } =
    useAdminProduct(productId);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [isTogglingActive, setIsTogglingActive] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    void listCategories(accessToken).then((result) => setCategories(result.categories));
  }, [accessToken]);

  if (loading) {
    return <p className="py-12 text-center font-body text-sm text-text-secondary">Loading…</p>;
  }
  if (error) {
    return <p className="py-12 text-center font-body text-sm text-error">{error}</p>;
  }
  if (!product) {
    return <p className="py-12 text-center font-body text-sm text-text-secondary">Product not found.</p>;
  }

  const toggleActive = async () => {
    setIsTogglingActive(true);
    try {
      await setActive(!product.isActive);
      toast.success(product.isActive ? "Product deactivated" : "Product activated");
    } catch (error_) {
      toast.error(error_ instanceof ApiError ? error_.message : "That didn't work.");
    } finally {
      setIsTogglingActive(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 md:max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl text-text-primary">{product.name}</h1>
        <div className="flex items-center gap-2">
          <Badge variant={product.isActive ? "success" : "neutral"}>{product.isActive ? "active" : "inactive"}</Badge>
          <Button variant="secondary" size="sm" isLoading={isTogglingActive} onClick={() => void toggleActive()}>
            {product.isActive ? "Deactivate" : "Activate"}
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 font-body text-sm font-medium text-text-primary">Details</h2>
        <ProductForm
          categories={categories}
          initialValues={{
            name: product.name,
            slug: product.slug,
            categoryId: product.categoryId,
            description: product.description ?? "",
            brand: product.brand ?? "",
            metaTitle: product.metaTitle ?? "",
            metaDescription: product.metaDescription ?? "",
          }}
          submitLabel="Save changes"
          onSubmit={async (payload) => {
            await update(payload);
            toast.success("Product updated");
          }}
        />
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 font-body text-sm font-medium text-text-primary">Images</h2>
        <ProductImages images={product.images} onAdd={addImage} onRemove={removeImage} onReorder={reorderImages} />
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 font-body text-sm font-medium text-text-primary">Variants</h2>
        <VariantsList
          variants={product.variants}
          categoryPricingMode={product.categoryPricingMode}
          onCreate={createVariant}
          onUpdate={updateVariant}
          onSetActive={setVariantActive}
        />
      </Card>
    </div>
  );
}
