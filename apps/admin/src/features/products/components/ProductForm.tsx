"use client";

import { Button, FormField, Textarea } from "@woobe/ui";
import { useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import type { CategoryOption } from "../api/admin-categories.client";
import type { CreateProductPayload } from "../api/admin-products.client";

export interface ProductFormValues {
  name: string;
  slug: string;
  categoryId: string;
  description: string;
  brand: string;
  metaTitle: string;
  metaDescription: string;
}

const EMPTY_VALUES: ProductFormValues = { name: "", slug: "", categoryId: "", description: "", brand: "", metaTitle: "", metaDescription: "" };

/** Shared by the "New product" page and the product-detail page's own metadata-edit section (week2 (1).md §16). */
export function ProductForm({
  categories,
  initialValues,
  submitLabel,
  onSubmit,
}: {
  categories: CategoryOption[];
  initialValues?: Partial<ProductFormValues>;
  submitLabel: string;
  onSubmit: (payload: CreateProductPayload) => Promise<void>;
}) {
  const [values, setValues] = useState<ProductFormValues>({ ...EMPTY_VALUES, ...initialValues });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const set = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) => setValues((prev) => ({ ...prev, [key]: value }));

  const onFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.categoryId) {
      toast.error("Choose a category");
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit({
        name: values.name,
        slug: values.slug,
        categoryId: values.categoryId,
        description: values.description || undefined,
        brand: values.brand || undefined,
        metaTitle: values.metaTitle || undefined,
        metaDescription: values.metaDescription || undefined,
      });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "That didn't work.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={onFormSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Name" value={values.name} onChange={(e) => set("name", e.target.value)} required />
        <FormField label="Slug" value={values.slug} onChange={(e) => set("slug", e.target.value)} required />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="font-body text-sm font-medium text-text-primary" htmlFor="product-category">
          Category
        </label>
        <select
          id="product-category"
          value={values.categoryId}
          onChange={(e) => set("categoryId", e.target.value)}
          className="h-11 rounded-control border border-border bg-surface px-4 font-body text-base text-text-primary"
        >
          <option value="">Select a category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>

      <FormField label="Brand (optional)" value={values.brand} onChange={(e) => set("brand", e.target.value)} />

      <div className="flex flex-col gap-1.5">
        <label className="font-body text-sm font-medium text-text-primary" htmlFor="product-description">
          Description
        </label>
        <Textarea id="product-description" value={values.description} onChange={(e) => set("description", e.target.value)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="SEO title (optional)" value={values.metaTitle} onChange={(e) => set("metaTitle", e.target.value)} />
        <FormField label="SEO description (optional)" value={values.metaDescription} onChange={(e) => set("metaDescription", e.target.value)} />
      </div>

      <Button type="submit" isLoading={isSubmitting} className="self-start">
        {submitLabel}
      </Button>
    </form>
  );
}
