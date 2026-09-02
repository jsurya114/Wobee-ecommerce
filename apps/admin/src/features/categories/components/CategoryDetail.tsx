"use client";

import { LoadingState } from "@/features/shell/components/LoadingState";
import { Badge, Button, Card } from "@woobe/ui";
import { useState } from "react";
import { toast } from "sonner";
import { useAdminCategory } from "../hooks/useAdminCategory";
import { CategoryForm } from "./CategoryForm";

export function CategoryDetail({ categoryId }: { categoryId: string }) {
  const { category, loading, error, update, setActive } = useAdminCategory(categoryId);
  const [isTogglingActive, setIsTogglingActive] = useState(false);

  if (loading) {
    return <LoadingState />;
  }
  if (error) {
    return <p className="py-12 text-center font-body text-sm text-error">{error}</p>;
  }
  if (!category) {
    return <p className="py-12 text-center font-body text-sm text-text-secondary">Category not found.</p>;
  }

  const toggleActive = async () => {
    setIsTogglingActive(true);
    try {
      await setActive(!category.isActive);
      toast.success(category.isActive ? "Category deactivated" : "Category activated");
    } catch {
      toast.error("Couldn't update status.");
    } finally {
      setIsTogglingActive(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 md:max-w-xl">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl text-text-primary">{category.name}</h1>
        <div className="flex items-center gap-2">
          <Badge variant={category.isActive ? "success" : "neutral"}>{category.isActive ? "active" : "inactive"}</Badge>
          <Button variant="secondary" size="sm" isLoading={isTogglingActive} onClick={() => void toggleActive()}>
            {category.isActive ? "Deactivate" : "Activate"}
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 font-body text-sm font-medium text-text-primary">Details</h2>
        <CategoryForm
          // Next reuses this component instance across /categories/[id1] ->
          // [id2] navigation — same fix as ProductForm/CollectionForm.
          key={categoryId}
          initialValues={{ name: category.name, slug: category.slug, imageUrl: category.imageUrl ?? "" }}
          submitLabel="Save changes"
          onSubmit={async (payload) => {
            await update(payload);
            toast.success("Category updated");
          }}
        />
      </Card>
    </div>
  );
}
