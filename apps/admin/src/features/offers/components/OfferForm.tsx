"use client";

import { Button, FormField, RadioGroup, RadioGroupItem, Textarea } from "@woobe/ui";
import { paiseToRupees, rupeesToPaise } from "@woobe/utils";
import { useState } from "react";
import { useFormError } from "@/lib/use-form-error";
import { useAdminCategories } from "@/features/products/hooks/useAdminCategories";
import { useAdminProducts } from "@/features/products/hooks/useAdminProducts";
import type { OfferDiscountType, OfferPayload, OfferScope } from "../api/admin-offers.client";

export interface OfferFormValues {
  name: string;
  description: string;
  discountType: OfferDiscountType;
  /** Whole percent (1-100) for PERCENTAGE; whole rupees for FIXED_AMOUNT — converted to paise only at submit, same boundary CouponForm's own value field already establishes. */
  value: string;
  scope: OfferScope;
  categoryId: string;
  productIds: string[];
  priority: string;
  startsAt: string;
  endsAt: string;
}

const EMPTY_VALUES: OfferFormValues = {
  name: "",
  description: "",
  discountType: "PERCENTAGE",
  value: "",
  scope: "ALL_PRODUCTS",
  categoryId: "",
  productIds: [],
  priority: "",
  startsAt: "",
  endsAt: "",
};

/**
 * Shared by "New offer" and the offer-detail page's own edit section.
 * Cross-field business rules (percentage 1-100, endsAt-after-startsAt,
 * scope/target consistency) are never re-implemented here — the server
 * (validateOfferInput) is authoritative; this only maps field-level errors
 * it returns back onto the right input, same posture CouponForm's own doc
 * comment already establishes for that module.
 *
 * The target selector is scope-dependent, per the spec's own "Scope =
 * CATEGORY -> show category selector; Scope = PRODUCTS -> show product
 * selector; Scope = ALL_PRODUCTS -> no target selector" requirement.
 */
export function OfferForm({
  initialValues,
  submitLabel,
  onSubmit,
}: {
  initialValues?: Partial<OfferFormValues>;
  submitLabel: string;
  onSubmit: (payload: OfferPayload) => Promise<void>;
}) {
  const [values, setValues] = useState<OfferFormValues>({ ...EMPTY_VALUES, ...initialValues });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { fieldErrors, formError, handle, setFieldError, clear } = useFormError();
  const { categories } = useAdminCategories();
  // First 100 active products — a search box is the natural next step once a
  // real catalogue exceeds this comfortably; out of scope for this pass.
  const { items: products } = useAdminProducts({ isActive: true, pageSize: 100 });

  const set = <K extends keyof OfferFormValues>(key: K, value: OfferFormValues[K]) => setValues((prev) => ({ ...prev, [key]: value }));

  const toggleProduct = (productId: string) => {
    set(
      "productIds",
      values.productIds.includes(productId) ? values.productIds.filter((id) => id !== productId) : [...values.productIds, productId],
    );
  };

  const onFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clear();

    if (!values.name.trim()) {
      setFieldError("name", "Enter a name");
      return;
    }
    const value = Number(values.value);
    if (!values.value.trim() || !Number.isFinite(value) || value <= 0) {
      setFieldError("discountValue", "Enter a positive value");
      return;
    }
    if (!values.startsAt || !values.endsAt) {
      setFieldError(values.startsAt ? "endsAt" : "startsAt", "Set both a start and an end date");
      return;
    }
    if (values.scope === "CATEGORY" && !values.categoryId) {
      setFieldError("categoryId", "Choose a category");
      return;
    }
    if (values.scope === "PRODUCTS" && values.productIds.length === 0) {
      setFieldError("productIds", "Choose at least one product");
      return;
    }

    const payload: OfferPayload = {
      name: values.name.trim(),
      // `|| undefined` (never `|| null`), matching ProductForm's own established convention for this exact shape — `createOfferSchema.description` is optional but not nullable (only `updateOfferSchema` accepts an explicit null to clear a previously-set value); omitting the field satisfies both schemas at once.
      description: values.description.trim() || undefined,
      discountType: values.discountType,
      discountValue: values.discountType === "FIXED_AMOUNT" ? rupeesToPaise(value) : value,
      scope: values.scope,
      categoryId: values.scope === "CATEGORY" ? values.categoryId : null,
      productIds: values.scope === "PRODUCTS" ? values.productIds : [],
      priority: values.priority.trim() ? Number(values.priority) : 0,
      startsAt: new Date(values.startsAt).toISOString(),
      endsAt: new Date(values.endsAt).toISOString(),
    };

    setIsSubmitting(true);
    try {
      await onSubmit(payload);
    } catch (error) {
      handle(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // noValidate: this form's own field-level checks and its catch block's ApiError/fieldErrors
  // handling already surface real messages — native HTML validation was intercepting
  // submission before either ran, showing the browser's own generic bubble.
  return (
    <form onSubmit={onFormSubmit} className="flex flex-col gap-4" noValidate>
      <FormField label="Name" value={values.name} onChange={(e) => set("name", e.target.value)} placeholder="Diwali Sale" required error={fieldErrors.name} />

      <div className="flex flex-col gap-1.5">
        <label className="font-body text-sm font-medium text-text-primary" htmlFor="offer-description">
          Description (optional)
        </label>
        <Textarea id="offer-description" value={values.description} onChange={(e) => set("description", e.target.value)} />
      </div>

      <div className="flex flex-col gap-2">
        <span className="font-body text-sm font-medium text-text-primary">Discount type</span>
        <RadioGroup
          value={values.discountType}
          onValueChange={(next) => set("discountType", next as OfferDiscountType)}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <RadioGroupItem value="PERCENTAGE" label="Percentage" description="e.g. 20% off the eligible price" className="flex-1" />
          <RadioGroupItem value="FIXED_AMOUNT" label="Fixed amount" description="e.g. ₹300 off, regardless of price" className="flex-1" />
        </RadioGroup>
      </div>

      <FormField
        label={values.discountType === "PERCENTAGE" ? "Percentage (%)" : "Discount amount (₹)"}
        type="number"
        min={1}
        max={values.discountType === "PERCENTAGE" ? 100 : undefined}
        step="1"
        value={values.value}
        onChange={(e) => set("value", e.target.value)}
        required
        error={fieldErrors.discountValue}
      />

      <div className="flex flex-col gap-2">
        <span className="font-body text-sm font-medium text-text-primary">Applies to</span>
        <RadioGroup value={values.scope} onValueChange={(next) => set("scope", next as OfferScope)} className="flex flex-col gap-2 sm:flex-row">
          <RadioGroupItem value="ALL_PRODUCTS" label="Entire store" className="flex-1" />
          <RadioGroupItem value="CATEGORY" label="A category" className="flex-1" />
          <RadioGroupItem value="PRODUCTS" label="Selected products" className="flex-1" />
        </RadioGroup>
      </div>

      {values.scope === "CATEGORY" ? (
        <div className="flex flex-col gap-1.5">
          <label className="font-body text-sm font-medium text-text-primary" htmlFor="offer-category">
            Category
          </label>
          <select
            id="offer-category"
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
      ) : null}

      {values.scope === "PRODUCTS" ? (
        <div className="flex flex-col gap-1.5">
          <span className="font-body text-sm font-medium text-text-primary">Products</span>
          <div className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-control border border-border p-2">
            {products.length === 0 ? (
              <p className="font-body text-sm text-text-secondary">No active products found.</p>
            ) : (
              products.map((product) => (
                <label key={product.id} className="flex items-center gap-2 rounded px-2 py-1 font-body text-sm text-text-primary hover:bg-primary-tint/30">
                  <input type="checkbox" checked={values.productIds.includes(product.id)} onChange={() => toggleProduct(product.id)} />
                  {product.name}
                </label>
              ))
            )}
          </div>
          {fieldErrors.productIds ? (
            <p role="alert" className="font-body text-sm text-error">
              {fieldErrors.productIds}
            </p>
          ) : null}
        </div>
      ) : null}

      <FormField
        label="Priority (optional)"
        type="number"
        min={0}
        step="1"
        value={values.priority}
        onChange={(e) => set("priority", e.target.value)}
        helperText="Tie-breaker when two offers of the same scope match the same product — higher wins. Leave blank for 0."
        error={fieldErrors.priority}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Starts" type="datetime-local" value={values.startsAt} onChange={(e) => set("startsAt", e.target.value)} required error={fieldErrors.startsAt} />
        <FormField label="Ends" type="datetime-local" value={values.endsAt} onChange={(e) => set("endsAt", e.target.value)} required error={fieldErrors.endsAt} />
      </div>

      {formError ? (
        <p role="alert" className="font-body text-sm text-error">
          {formError}
        </p>
      ) : null}

      <Button type="submit" isLoading={isSubmitting} className="self-start">
        {submitLabel}
      </Button>
    </form>
  );
}

/** ISO -> the local `YYYY-MM-DDTHH:mm` shape a `datetime-local` input needs — mirrors CouponForm's own toDatetimeLocalValue. */
export function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function toRupeesValue(paise: number): string {
  return String(paiseToRupees(paise));
}
