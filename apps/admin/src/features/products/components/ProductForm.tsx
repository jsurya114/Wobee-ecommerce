"use client";

import { Button, FormField, Textarea } from "@woobe/ui";
import { slugify } from "@woobe/utils";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useFormError } from "@/lib/use-form-error";
import type { CategoryOption } from "../api/admin-categories.client";
import type { CreateProductPayload } from "../api/admin-products.client";

export interface ProductFormValues {
  name: string;
  slug: string;
  categoryId: string;
  /** Product-level (2026-09-14, moved off Category — see PricingMode's own doc comment in schema.prisma). Independent of category: two products in the same category may use different modes. */
  pricingMode: "WEIGHT_BASED" | "FIXED";
  description: string;
  brand: string;
  metaTitle: string;
  metaDescription: string;
}

const EMPTY_VALUES: ProductFormValues = {
  name: "",
  slug: "",
  categoryId: "",
  pricingMode: "WEIGHT_BASED",
  description: "",
  brand: "",
  metaTitle: "",
  metaDescription: "",
};

/**
 * Shared by the "New product" page and the product-detail page's own
 * metadata-edit section (week2 (1).md §16).
 *
 * `pricingMode` (2026-09-14): switching an EXISTING product's mode is
 * validated server-side against its variants (UpdateProductUseCase) —
 * WEIGHT_BASED -> FIXED is rejected with a field error here if any active
 * variant has no fixed price set yet (surfaced via the existing
 * `useFormError` plumbing below, same as any other field error this form
 * already handles). A brand-new product has no variants yet, so the choice
 * here is unconstrained either way.
 */
export function ProductForm({
  categories,
  initialValues,
  submitLabel,
  cancelHref,
  onSubmit,
}: {
  categories: CategoryOption[];
  initialValues?: Partial<ProductFormValues>;
  submitLabel: string;
  /** Where "Cancel" goes — the product list. Leaving discards nothing saved; unsaved edits are simply not submitted. */
  cancelHref?: string;
  onSubmit: (payload: CreateProductPayload) => Promise<void>;
}) {
  const [values, setValues] = useState<ProductFormValues>({ ...EMPTY_VALUES, ...initialValues });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { fieldErrors, formError, handle, setFieldError, clear } = useFormError();
  // An existing product's slug is never auto-changed by editing its name —
  // only a brand-new product's slug follows the name as it's typed, and
  // only until the admin edits the slug field themselves (then it stops
  // following, same as any other "smart default" text field). The final
  // slug is still just a preview: the server canonicalizes and
  // de-duplicates whatever is submitted (see resolveUniqueSlug).
  const [slugTouched, setSlugTouched] = useState(Boolean(initialValues?.slug));

  const set = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) => setValues((prev) => ({ ...prev, [key]: value }));

  const onNameChange = (name: string) => {
    setValues((prev) => ({ ...prev, name, slug: slugTouched ? prev.slug : slugify(name) }));
  };

  const onSlugChange = (slug: string) => {
    setSlugTouched(true);
    set("slug", slug);
  };

  const onFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clear();
    if (!values.categoryId) {
      setFieldError("categoryId", "Choose a category");
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit({
        name: values.name,
        slug: values.slug,
        categoryId: values.categoryId,
        pricingMode: values.pricingMode,
        description: values.description || undefined,
        brand: values.brand || undefined,
        metaTitle: values.metaTitle || undefined,
        metaDescription: values.metaDescription || undefined,
      });
    } catch (error) {
      handle(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // noValidate: this form's own onFormSubmit already validates (category chosen, and the
  // backend's own field errors on save) and surfaces a real message via toast/ApiError —
  // native HTML validation was intercepting submission before any of that ran, showing the
  // browser's own generic "Please fill out this field" bubble instead.
  //
  // Layout (2026-09-29 admin UX pass): grouped into Basic information / Pricing / an optional,
  // collapsed-by-default search-listing section, with the save action in a bar that stays in
  // view while scrolling. Fields, validation and payload are unchanged.
  const hasSeoContent = Boolean(values.metaTitle || values.metaDescription || fieldErrors.metaTitle || fieldErrors.metaDescription);

  return (
    <form onSubmit={onFormSubmit} className="flex flex-col gap-6" noValidate>
      <FormSection title="Basic information">
        <FormField label="Name" value={values.name} onChange={(e) => onNameChange(e.target.value)} required error={fieldErrors.name} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="font-body text-sm font-medium text-text-primary" htmlFor="product-category">
              Category
            </label>
            <select
              id="product-category"
              value={values.categoryId}
              onChange={(e) => set("categoryId", e.target.value)}
              aria-invalid={Boolean(fieldErrors.categoryId)}
              className="h-11 rounded-control border border-border bg-surface px-4 font-body text-base text-text-primary"
            >
              <option value="">Select a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {fieldErrors.categoryId ? (
              <p role="alert" className="font-body text-sm text-error">
                {fieldErrors.categoryId}
              </p>
            ) : null}
          </div>
          <FormField
            label="Brand (optional)"
            value={values.brand}
            onChange={(e) => set("brand", e.target.value)}
            error={fieldErrors.brand}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="font-body text-sm font-medium text-text-primary" htmlFor="product-description">
            Description
          </label>
          <Textarea id="product-description" value={values.description} onChange={(e) => set("description", e.target.value)} />
        </div>
        <FormField
          label="URL slug"
          value={values.slug}
          onChange={(e) => onSlugChange(e.target.value)}
          required
          error={fieldErrors.slug}
          helperText={slugTouched ? "Custom URL — won't change automatically." : "Auto-generated from the name. Edit to set a custom URL."}
        />
      </FormSection>

      <FormSection title="Pricing">
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Pricing mode</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <PricingModeOption
              value="WEIGHT_BASED"
              checked={values.pricingMode === "WEIGHT_BASED"}
              onSelect={() => set("pricingMode", "WEIGHT_BASED")}
              title="Weight based"
              hint="Variant weight × the global ₹/kg rate set in Settings."
            />
            <PricingModeOption
              value="FIXED"
              checked={values.pricingMode === "FIXED"}
              onSelect={() => set("pricingMode", "FIXED")}
              title="Fixed price"
              hint="Each variant has its own price. Weight is for shipping only."
            />
          </div>
          {fieldErrors.pricingMode ? (
            <p role="alert" className="font-body text-sm text-error">
              {fieldErrors.pricingMode}
            </p>
          ) : null}
        </fieldset>
      </FormSection>

      <details open={hasSeoContent} className="group rounded-control border border-border">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-body text-sm font-medium text-text-primary">
          <span>
            Search engine listing <span className="font-normal text-text-secondary">(optional)</span>
          </span>
          <ChevronDown className="h-4 w-4 text-text-secondary transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="grid gap-4 border-t border-border p-4 sm:grid-cols-2">
          <FormField
            label="SEO title"
            value={values.metaTitle}
            onChange={(e) => set("metaTitle", e.target.value)}
            error={fieldErrors.metaTitle}
            helperText="Defaults to the product name."
          />
          <FormField
            label="SEO description"
            value={values.metaDescription}
            onChange={(e) => set("metaDescription", e.target.value)}
            error={fieldErrors.metaDescription}
            helperText="Defaults to the description."
          />
        </div>
      </details>

      {formError ? (
        <p role="alert" className="font-body text-sm text-error">
          {formError}
        </p>
      ) : null}

      <div className="sticky bottom-0 z-10 -mx-4 -mb-4 flex flex-wrap items-center gap-3 rounded-b-card border-t border-border bg-surface/95 px-4 py-3 backdrop-blur">
        <Button type="submit" isLoading={isSubmitting}>
          {isSubmitting ? "Saving…" : submitLabel}
        </Button>
        {cancelHref ? (
          <Link href={cancelHref} className="font-body text-sm text-text-secondary hover:text-primary">
            Cancel
          </Link>
        ) : null}
      </div>
    </form>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h3 className="font-body text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary">{title}</h3>
      {children}
    </section>
  );
}

function PricingModeOption({
  value,
  checked,
  onSelect,
  title,
  hint,
}: {
  value: ProductFormValues["pricingMode"];
  checked: boolean;
  onSelect: () => void;
  title: string;
  hint: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-control border p-3 transition-colors ${
        checked ? "border-primary bg-primary/5" : "border-border hover:border-text-secondary"
      }`}
    >
      <input type="radio" name="pricingMode" value={value} checked={checked} onChange={onSelect} className="mt-1 accent-primary" />
      <span className="flex flex-col gap-0.5">
        <span className="font-body text-sm font-medium text-text-primary">{title}</span>
        <span className="font-body text-xs text-text-secondary">{hint}</span>
      </span>
    </label>
  );
}
