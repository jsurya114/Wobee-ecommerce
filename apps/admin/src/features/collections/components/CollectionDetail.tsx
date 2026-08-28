"use client";

import { Badge, Button, Card } from "@woobe/ui";
import { useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { useAdminCollection } from "../hooks/useAdminCollection";
import { AssignedProductsList } from "./AssignedProductsList";
import { CollectionForm } from "./CollectionForm";
import { ProductPicker } from "./ProductPicker";

export function CollectionDetail({ collectionId }: { collectionId: string }) {
  const { collection, assignedProducts, loading, error, update, setActive, assignProduct, removeProduct, reorderProducts } =
    useAdminCollection(collectionId);
  const [isTogglingActive, setIsTogglingActive] = useState(false);

  if (loading) {
    return <p className="py-12 text-center font-body text-sm text-text-secondary">Loading…</p>;
  }
  if (error) {
    return <p className="py-12 text-center font-body text-sm text-error">{error}</p>;
  }
  if (!collection) {
    return <p className="py-12 text-center font-body text-sm text-text-secondary">Collection not found.</p>;
  }

  const toggleActive = async () => {
    setIsTogglingActive(true);
    try {
      await setActive(!collection.isActive);
      toast.success(collection.isActive ? "Collection deactivated" : "Collection activated");
    } catch (error_) {
      toast.error(error_ instanceof ApiError ? error_.message : "That didn't work.");
    } finally {
      setIsTogglingActive(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 md:max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl text-text-primary">{collection.name}</h1>
        <div className="flex items-center gap-2">
          <Badge variant={collection.isActive ? "success" : "neutral"}>{collection.isActive ? "active" : "inactive"}</Badge>
          <Button variant="secondary" size="sm" isLoading={isTogglingActive} onClick={() => void toggleActive()}>
            {collection.isActive ? "Deactivate" : "Activate"}
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 font-body text-sm font-medium text-text-primary">Details</h2>
        <CollectionForm
          initialValues={{ name: collection.name, slug: collection.slug, description: collection.description ?? undefined }}
          submitLabel="Save changes"
          onSubmit={async (payload) => {
            await update(payload);
            toast.success("Collection updated");
          }}
        />
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 font-body text-sm font-medium text-text-primary">Products in this collection</h2>
        <AssignedProductsList products={assignedProducts} onRemove={removeProduct} onReorder={reorderProducts} />
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 font-body text-sm font-medium text-text-primary">Add a product</h2>
        <ProductPicker excludeProductIds={collection.productIds} onAssign={assignProduct} />
      </Card>
    </div>
  );
}
