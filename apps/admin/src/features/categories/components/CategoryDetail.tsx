"use client";

import { LoadingState } from "@/features/shell/components/LoadingState";
import { Badge, Button, Card } from "@woobe/ui";
import { useState } from "react";
import { toast } from "sonner";
import { useSaveAndRedirect } from "@/lib/use-save-and-redirect";
import { useAdminCategory } from "../hooks/useAdminCategory";
import { CategoryForm } from "./CategoryForm";

export function CategoryDetail({ categoryId }: { categoryId: string }) {
  const saveAndRedirect = useSaveAndRedirect("/categories");
  const { category, loading, error, update, setActive } = useAdminCategory(categoryId);
  const [isTogglingActive, setIsTogglingActive] = useState(false);
  // Bumped after every successful save — see the `key` comment on CategoryForm below.
  const [saveGen, setSaveGen] = useState(0);

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
          // `saveGen` is folded in too: saving an edit to the SAME category
          // doesn't change `categoryId`, so without it the form's local
          // state would stay frozen at its pre-save values even though
          // `category` (and the listing) already reflect the fresh save.
          key={`${categoryId}:${saveGen}`}
          initialValues={{ name: category.name, slug: category.slug, imageUrl: category.imageUrl ?? "" }}
          submitLabel="Save changes"
          onSubmit={(payload) =>
            saveAndRedirect(async () => {
              await update(payload);
              setSaveGen((g) => g + 1);
            })
          }
        />
      </Card>
    </div>
  );
}
