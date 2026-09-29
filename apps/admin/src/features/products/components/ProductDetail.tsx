"use client";

import { LoadingState } from "@/features/shell/components/LoadingState";
import { Badge, Button, Card } from "@woobe/ui";
import { useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { useSaveAndRedirect } from "@/lib/use-save-and-redirect";
import { useAdminCategories } from "../hooks/useAdminCategories";
import { useAdminProduct } from "../hooks/useAdminProduct";
import { ProductForm } from "./ProductForm";
import { ProductCostsPanel } from "./ProductCostsPanel";
import { ProductImages } from "./ProductImages";
import { VariantsList } from "./VariantsList";
import { PageHeader } from "@/features/shell/components/PageHeader";

export function ProductDetail({ productId }: { productId: string }) {
  const saveAndRedirect = useSaveAndRedirect("/products");
  const {
    product,
    loading,
    error,
    update,
    setActive,
    createVariant,
    updateVariant,
    setVariantActive,
    addImage,
    removeImage,
    reorderImages,
  } = useAdminProduct(productId);
  const { categories } = useAdminCategories();
  const [isTogglingActive, setIsTogglingActive] = useState(false);
  // Bumped after every successful save — see the `key` comment on ProductForm
  // below for why this is needed on top of the id-keyed remount.
  const [saveGen, setSaveGen] = useState(0);

  if (loading) {
    return <LoadingState />;
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
    <div className="flex max-w-6xl flex-col gap-6">
      <PageHeader
        back={{ href: "/products", label: "Products" }}
        title={product.name}
        meta={<Badge variant={product.isActive ? "success" : "neutral"}>{product.isActive ? "active" : "inactive"}</Badge>}
        actions={
          <>
            <Button variant="secondary" size="sm" isLoading={isTogglingActive} onClick={() => void toggleActive()}>
              {product.isActive ? "Deactivate" : "Activate"}
            </Button>
          </>
        }
      />

      {/* Two columns from xl (2026-09-29 admin UX pass): the things edited most — details and
          variants — on the left; images and cost alongside instead of below, so a typical edit
          no longer needs a long scroll. Single column (same order) below xl. */}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="p-4">
            <ProductForm
              // Next's App Router reuses this component instance across
              // /products/[id1] -> /products/[id2] navigation — without a key
              // tied to the id, ProductForm's internal useState(values) would
              // keep showing the previous product's values after `product` has
              // already updated underneath it (same bug class as BannerForm).
              // `saveGen` is folded in too: saving an edit to the SAME product
              // doesn't change `productId`, so without it the form's local
              // state would stay frozen at its pre-save values even though
              // `product` (and the listing) already reflect the fresh save.
              key={`${productId}:${saveGen}`}
              categories={categories}
              initialValues={{
                name: product.name,
                slug: product.slug,
                categoryId: product.categoryId,
                pricingMode: product.pricingMode,
                description: product.description ?? "",
                brand: product.brand ?? "",
                metaTitle: product.metaTitle ?? "",
                metaDescription: product.metaDescription ?? "",
                highlights: product.highlights,
              }}
              submitLabel="Save changes"
              cancelHref="/products"
              onSubmit={(payload) =>
                saveAndRedirect(async () => {
                  await update(payload);
                  setSaveGen((g) => g + 1);
                })
              }
            />
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 font-body text-sm font-medium text-text-primary">Variants</h2>
            <VariantsList
              variants={product.variants}
              pricingMode={product.pricingMode}
              onCreate={createVariant}
              onUpdate={updateVariant}
              onSetActive={setVariantActive}
            />
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card className="p-4">
            <h2 className="mb-3 font-body text-sm font-medium text-text-primary">Images</h2>
            <ProductImages images={product.images} onAdd={addImage} onRemove={removeImage} onReorder={reorderImages} />
          </Card>
          {/* Renders nothing unless the signed-in role has the analytics permission (super_admin) — cost is confidential. Keyed so a variant added above is picked up. */}
          <ProductCostsPanel key={`costs-${product.variants.length}`} productId={productId} />
        </div>
      </div>
    </div>
  );
}
