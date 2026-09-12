"use client";

import { Button, FormField } from "@woobe/ui";
import { useState } from "react";
import { useFormError } from "@/lib/use-form-error";
import type { AdminProductVariant, UpdateVariantPayload, VariantPayload } from "../api/admin-products.client";

export interface VariantFormValues {
  color: string;
  size: string;
  weightGrams: string;
  fixedPricePaise: string;
  fabric: string;
  fit: string;
  measurements: string;
  initialQuantity: string;
}

function toValues(variant?: AdminProductVariant): VariantFormValues {
  return {
    color: variant?.color ?? "",
    size: variant?.size ?? "",
    weightGrams: variant ? String(variant.weightGrams) : "",
    fixedPricePaise: variant?.fixedPricePaise != null ? String(variant.fixedPricePaise) : "",
    fabric: variant?.fabric ?? "",
    fit: variant?.fit ?? "",
    measurements: variant?.measurements ?? "",
    initialQuantity: "",
  };
}

/**
 * Shared by "add a new variant" and "edit an existing variant" (week2 (1).md
 * §16's own "Variant management" operations list). `initialQuantity` only
 * applies when creating.
 *
 * `categoryPricingMode` (2026-08-31): decides which pricing field this
 * variant needs — a WEIGHT_BASED product's price is always weight × the
 * single global ₹/kg rate managed in Settings (no per-variant override —
 * that field is deprecated, see resolve-effective-rate.ts); a FIXED
 * product's variants take a required fixed price instead (ornaments/
 * footwear/accessories aren't priced by weight, see PricingMode's own doc
 * comment in schema.prisma). Weight stays required in both modes — it's
 * real shipping weight either way.
 */
export function VariantForm({
  variant,
  categoryPricingMode,
  onSubmit,
  onCancel,
}: {
  variant?: AdminProductVariant;
  categoryPricingMode: "WEIGHT_BASED" | "FIXED";
  onSubmit: (payload: VariantPayload | UpdateVariantPayload) => Promise<void>;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<VariantFormValues>(toValues(variant));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { fieldErrors, formError, handle, setFieldError, clear } = useFormError();
  const isEditing = Boolean(variant);
  const isFixed = categoryPricingMode === "FIXED";

  const set = <K extends keyof VariantFormValues>(key: K, value: VariantFormValues[K]) => setValues((prev) => ({ ...prev, [key]: value }));

  const onFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clear();
    const weightGrams = Number(values.weightGrams);
    if (!values.color.trim()) {
      setFieldError("color", "Colour is required");
      return;
    }
    if (!values.size.trim()) {
      setFieldError("size", "Size is required");
      return;
    }
    if (!weightGrams) {
      setFieldError("weightGrams", "Weight is required");
      return;
    }
    const fixedPricePaise = values.fixedPricePaise ? Number(values.fixedPricePaise) : null;
    if (isFixed && !fixedPricePaise) {
      setFieldError("fixedPricePaise", "This category is fixed-price — enter a price");
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit({
        color: values.color.trim(),
        size: values.size.trim(),
        weightGrams,
        fixedPricePaise: isFixed ? fixedPricePaise : null,
        fabric: values.fabric || null,
        fit: values.fit || null,
        measurements: values.measurements || null,
        ...(isEditing ? {} : { initialQuantity: values.initialQuantity ? Number(values.initialQuantity) : 0 }),
      });
      if (!isEditing) setValues(toValues());
    } catch (error) {
      handle(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // noValidate: the field-level check above and this form's own catch/ApiError handling
  // already surface real messages — native HTML validation was intercepting submission
  // before either ran, showing the browser's own generic bubble instead.
  return (
    <form onSubmit={onFormSubmit} className="flex flex-col gap-3 rounded-control border border-border p-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <span className="font-body text-sm font-medium text-text-primary">SKU</span>
        <span className="font-body text-sm text-text-secondary">
          {isEditing ? `${variant!.sku} · Automatically generated` : "Assigned automatically when you save"}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          label="Weight (grams)"
          type="number"
          value={values.weightGrams}
          onChange={(e) => set("weightGrams", e.target.value)}
          error={fieldErrors.weightGrams}
        />
        <FormField label="Colour" value={values.color} onChange={(e) => set("color", e.target.value)} error={fieldErrors.color} />
        <FormField label="Size" value={values.size} onChange={(e) => set("size", e.target.value)} error={fieldErrors.size} />
        {isFixed ? (
          <FormField
            label="Fixed price (paise)"
            type="number"
            value={values.fixedPricePaise}
            onChange={(e) => set("fixedPricePaise", e.target.value)}
            error={fieldErrors.fixedPricePaise}
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className="font-body text-sm font-medium text-text-primary">Price</span>
            <span className="font-body text-sm text-text-secondary">Weight × the global ₹/kg rate — set in Settings, not per variant.</span>
          </div>
        )}
        {!isEditing ? (
          <FormField
            label="Starting stock"
            type="number"
            value={values.initialQuantity}
            onChange={(e) => set("initialQuantity", e.target.value)}
            error={fieldErrors.initialQuantity}
          />
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label="Fabric (optional)" value={values.fabric} onChange={(e) => set("fabric", e.target.value)} error={fieldErrors.fabric} />
        <FormField label="Fit (optional)" value={values.fit} onChange={(e) => set("fit", e.target.value)} error={fieldErrors.fit} />
        <FormField
          label="Measurements (optional)"
          value={values.measurements}
          onChange={(e) => set("measurements", e.target.value)}
          error={fieldErrors.measurements}
        />
      </div>
      {formError ? (
        <p role="alert" className="font-body text-sm text-error">
          {formError}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" isLoading={isSubmitting}>
          {isEditing ? "Save variant" : "Add variant"}
        </Button>
        {onCancel ? (
          <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
