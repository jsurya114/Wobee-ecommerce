"use client";

import { Button, FormField } from "@woobe/ui";
import { slugify } from "@woobe/utils";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { uploadMedia } from "@/features/products/api/admin-media.client";
import { ApiError } from "@/lib/api-client";
import type { CategoryPayload } from "../api/admin-categories.client";

export interface CategoryFormValues {
  name: string;
  slug: string;
  imageUrl: string;
}

const EMPTY_VALUES: CategoryFormValues = { name: "", slug: "", imageUrl: "" };

/**
 * Shared by "New category" and the category-detail page's own edit section
 * — same slug-follows-name-until-touched behavior as ProductForm, same
 * upload/preview/replace image behavior as BannerForm. Reuses the existing
 * media upload endpoint (`uploadMedia`), no new storage path.
 */
export function CategoryForm({
  initialValues,
  submitLabel,
  onSubmit,
}: {
  initialValues?: Partial<CategoryFormValues>;
  submitLabel: string;
  onSubmit: (payload: CategoryPayload) => Promise<void>;
}) {
  const { withFreshToken } = useAdminAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<CategoryFormValues>({ ...EMPTY_VALUES, ...initialValues });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  // Same "smart default, stops following once edited" rule as ProductForm's
  // slug field — an existing category's slug never auto-changes just
  // because the name was edited (would break a storefront link/bookmark).
  const [slugTouched, setSlugTouched] = useState(Boolean(initialValues?.slug));

  const set = <K extends keyof CategoryFormValues>(key: K, value: CategoryFormValues[K]) => setValues((prev) => ({ ...prev, [key]: value }));

  const onNameChange = (name: string) => {
    setValues((prev) => ({ ...prev, name, slug: slugTouched ? prev.slug : slugify(name) }));
  };

  const onSlugChange = (slug: string) => {
    setSlugTouched(true);
    set("slug", slug);
  };

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setIsUploading(true);
    try {
      const media = await withFreshToken((token) => uploadMedia(file, values.name || "Category image", token));
      set("imageUrl", media.url);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const onFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit({ name: values.name.trim(), slug: values.slug, imageUrl: values.imageUrl || null });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "That didn't work.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={onFormSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Name" value={values.name} onChange={(e) => onNameChange(e.target.value)} required />
        <FormField
          label="Slug"
          value={values.slug}
          onChange={(e) => onSlugChange(e.target.value)}
          required
          helperText={slugTouched ? "Custom URL — won't change automatically." : "Auto-generated from the name. Edit to set a custom URL."}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-body text-sm font-medium text-text-primary">Image</span>
        {values.imageUrl ? (
          // Plain <img>, not next/image — same reasoning as ProductImages'/BannerForm's own thumbnail.
          <img src={values.imageUrl} alt="" className="h-24 w-24 rounded-control object-cover" />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-control border border-dashed border-border text-xs text-text-secondary">
            No image
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => void onFileSelected(e)}
        />
        <div className="flex gap-2">
          <Button type="button" variant="secondary" size="sm" isLoading={isUploading} onClick={() => fileInputRef.current?.click()} className="self-start">
            {values.imageUrl ? "Replace image" : "Upload image"}
          </Button>
          {values.imageUrl ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => set("imageUrl", "")} className="self-start">
              Remove
            </Button>
          ) : null}
        </div>
      </div>

      <Button type="submit" isLoading={isSubmitting} className="self-start">
        {submitLabel}
      </Button>
    </form>
  );
}
