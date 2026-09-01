"use client";

import { Button, FormField } from "@woobe/ui";
import { useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import type { AdminProductVariant, UpdateVariantPayload, VariantPayload } from "../api/admin-products.client";

export interface VariantFormValues {
  color: string;
  size: string;
  weightGrams: string;
  ratePerKgOverridePaise: string;
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
    ratePerKgOverridePaise: variant?.ratePerKgOverridePaise != null ? String(variant.ratePerKgOverridePaise) : "",
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
 * variant needs — a WEIGHT_BASED product's variants take an optional rate/kg
 * override; a FIXED product's variants take a required fixed price instead
 * (ornaments/footwear/accessories aren't priced by weight, see
 * PricingMode's own doc comment in schema.prisma). Weight stays required in
 * both modes — it's real shipping weight either way.
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
  const isEditing = Boolean(variant);
  const isFixed = categoryPricingMode === "FIXED";

  const set = <K extends keyof VariantFormValues>(key: K, value: VariantFormValues[K]) => setValues((prev) => ({ ...prev, [key]: value }));

  const onFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const weightGrams = Number(values.weightGrams);
    if (!values.color.trim() || !values.size.trim() || !weightGrams) {
      toast.error("Colour, size, and weight are required");
      return;
    }
    const fixedPricePaise = values.fixedPricePaise ? Number(values.fixedPricePaise) : null;
    if (isFixed && !fixedPricePaise) {
      toast.error("This category is fixed-price — enter a price");
      return;
    }
    setIsSubmitting(true);
    try {
      await onSubmit({
        color: values.color.trim(),
        size: values.size.trim(),
        weightGrams,
        ratePerKgOverridePaise: isFixed ? null : values.ratePerKgOverridePaise ? Number(values.ratePerKgOverridePaise) : null,
        fixedPricePaise: isFixed ? fixedPricePaise : null,
        fabric: values.fabric || null,
        fit: values.fit || null,
        measurements: values.measurements || null,
        ...(isEditing ? {} : { initialQuantity: values.initialQuantity ? Number(values.initialQuantity) : 0 }),
      });
      if (!isEditing) setValues(toValues());
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "That didn't work.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={onFormSubmit} className="flex flex-col gap-3 rounded-control border border-border p-4">
      <div className="flex flex-col gap-1.5">
        <span className="font-body text-sm font-medium text-text-primary">SKU</span>
        <span className="font-body text-sm text-text-secondary">
          {isEditing ? `${variant!.sku} · Automatically generated` : "Assigned automatically when you save"}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Weight (grams)" type="number" value={values.weightGrams} onChange={(e) => set("weightGrams", e.target.value)} />
        <FormField label="Colour" value={values.color} onChange={(e) => set("color", e.target.value)} />
        <FormField label="Size" value={values.size} onChange={(e) => set("size", e.target.value)} />
        {isFixed ? (
          <FormField
            label="Fixed price (paise)"
            type="number"
            value={values.fixedPricePaise}
            onChange={(e) => set("fixedPricePaise", e.target.value)}
          />
        ) : (
          <FormField
            label="Rate/kg override (paise, optional)"
            type="number"
            value={values.ratePerKgOverridePaise}
            onChange={(e) => set("ratePerKgOverridePaise", e.target.value)}
          />
        )}
        {!isEditing ? (
          <FormField label="Starting stock" type="number" value={values.initialQuantity} onChange={(e) => set("initialQuantity", e.target.value)} />
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label="Fabric (optional)" value={values.fabric} onChange={(e) => set("fabric", e.target.value)} />
        <FormField label="Fit (optional)" value={values.fit} onChange={(e) => set("fit", e.target.value)} />
        <FormField label="Measurements (optional)" value={values.measurements} onChange={(e) => set("measurements", e.target.value)} />
      </div>
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
