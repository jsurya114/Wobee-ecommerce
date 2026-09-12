"use client";

import { Button, FormField, RadioGroup, RadioGroupItem } from "@woobe/ui";
import { paiseToRupees, rupeesToPaise } from "@woobe/utils";
import { useState } from "react";
import { useFormError } from "@/lib/use-form-error";
import type { CouponPayload, CouponType } from "../api/admin-coupons.client";

export interface CouponFormValues {
  code: string;
  type: CouponType;
  /** Whole percent (1-100) for PERCENTAGE; whole rupees for FLAT — converted to paise only at submit (DEVELOPMENT_RULES.md #4, same boundary PricingSettingsForm's own comment describes). */
  value: string;
  minCartValueRupees: string;
  maxDiscountRupees: string;
  usageLimit: string;
  perUserLimit: string;
  validFrom: string;
  validTo: string;
}

const EMPTY_VALUES: CouponFormValues = {
  code: "",
  type: "PERCENTAGE",
  value: "",
  minCartValueRupees: "",
  maxDiscountRupees: "",
  usageLimit: "",
  perUserLimit: "",
  validFrom: "",
  validTo: "",
};

/** Business rules (percentage range, expiry-after-start, per-user vs. usage limit, maxDiscount-percentage-only) are never re-implemented here — the server (validateCouponInput) is authoritative; this only maps field-level errors it returns back onto the right input. */
export function CouponForm({
  initialValues,
  submitLabel,
  onSubmit,
}: {
  initialValues?: Partial<CouponFormValues>;
  submitLabel: string;
  onSubmit: (payload: CouponPayload) => Promise<void>;
}) {
  const [values, setValues] = useState<CouponFormValues>({ ...EMPTY_VALUES, ...initialValues });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { fieldErrors, formError, handle, setFieldError, clear } = useFormError();

  const set = <K extends keyof CouponFormValues>(key: K, value: CouponFormValues[K]) => setValues((prev) => ({ ...prev, [key]: value }));

  const onFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clear();

    if (!values.code.trim()) {
      setFieldError("code", "Enter a coupon code");
      return;
    }
    const value = Number(values.value);
    if (!values.value.trim() || !Number.isFinite(value) || value <= 0) {
      setFieldError("value", "Enter a positive value");
      return;
    }
    if (!values.validFrom || !values.validTo) {
      setFieldError(values.validFrom ? "validTo" : "validFrom", "Set both a start and an expiry date");
      return;
    }

    const payload: CouponPayload = {
      code: values.code.trim().toUpperCase(),
      type: values.type,
      value: values.type === "FLAT" ? rupeesToPaise(value) : value,
      minCartValuePaise: values.minCartValueRupees.trim() ? rupeesToPaise(Number(values.minCartValueRupees)) : null,
      maxDiscountPaise: values.type === "PERCENTAGE" && values.maxDiscountRupees.trim() ? rupeesToPaise(Number(values.maxDiscountRupees)) : null,
      usageLimit: values.usageLimit.trim() ? Number(values.usageLimit) : null,
      perUserLimit: values.perUserLimit.trim() ? Number(values.perUserLimit) : null,
      validFrom: new Date(values.validFrom).toISOString(),
      validTo: new Date(values.validTo).toISOString(),
    };

    setIsSubmitting(true);
    try {
      await onSubmit(payload);
    } catch (error) {
      // A duplicate-code 409 (ConflictError) has no structural field to attach to (it's not
      // a Zod field error) — `handle` correctly falls back to the one inline `formError`
      // banner below rather than a toast; a real 400 Zod error DOES land per-field via
      // `fieldErrors` (e.g. `fieldErrors.code`/`fieldErrors.value`), same backend field
      // names as `createCouponSchema`/`updateCouponSchema`.
      handle(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // noValidate: this form's own field-level checks above and its catch block's ApiError/
  // fieldErrors handling already surface real messages — native HTML validation was
  // intercepting submission before either ran, showing the browser's own generic bubble.
  return (
    <form onSubmit={onFormSubmit} className="flex flex-col gap-4" noValidate>
      <FormField
        label="Coupon code"
        value={values.code}
        onChange={(e) => set("code", e.target.value.toUpperCase())}
        placeholder="SUMMER20"
        required
        error={fieldErrors.code}
      />

      <div className="flex flex-col gap-2">
        <span className="font-body text-sm font-medium text-text-primary">Discount type</span>
        <RadioGroup value={values.type} onValueChange={(next) => set("type", next as CouponType)} className="flex flex-col gap-2 sm:flex-row">
          <RadioGroupItem value="PERCENTAGE" label="Percentage" description="e.g. 20% off the eligible total" className="flex-1" />
          <RadioGroupItem value="FLAT" label="Flat amount" description="e.g. ₹100 off, regardless of cart size" className="flex-1" />
        </RadioGroup>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label={values.type === "PERCENTAGE" ? "Percentage (%)" : "Discount amount (₹)"}
          type="number"
          min={values.type === "PERCENTAGE" ? 1 : 1}
          max={values.type === "PERCENTAGE" ? 100 : undefined}
          step="1"
          value={values.value}
          onChange={(e) => set("value", e.target.value)}
          required
          error={fieldErrors.value}
        />
        {values.type === "PERCENTAGE" ? (
          <FormField
            label="Max discount (₹, optional)"
            type="number"
            min={1}
            step="1"
            value={values.maxDiscountRupees}
            onChange={(e) => set("maxDiscountRupees", e.target.value)}
            helperText="Caps the percentage discount at this amount."
            error={fieldErrors.maxDiscountPaise}
          />
        ) : null}
      </div>

      <FormField
        label="Minimum cart value (₹, optional)"
        type="number"
        min={0}
        step="1"
        value={values.minCartValueRupees}
        onChange={(e) => set("minCartValueRupees", e.target.value)}
        helperText="Leave blank for no minimum."
        error={fieldErrors.minCartValuePaise}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Overall usage limit (optional)"
          type="number"
          min={1}
          step="1"
          value={values.usageLimit}
          onChange={(e) => set("usageLimit", e.target.value)}
          helperText="Total redemptions across every customer. Blank = unlimited."
          error={fieldErrors.usageLimit}
        />
        <FormField
          label="Per-customer limit (optional)"
          type="number"
          min={1}
          step="1"
          value={values.perUserLimit}
          onChange={(e) => set("perUserLimit", e.target.value)}
          helperText="Times any one customer can use this. Blank = unlimited."
          error={fieldErrors.perUserLimit}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Start"
          type="datetime-local"
          value={values.validFrom}
          onChange={(e) => set("validFrom", e.target.value)}
          required
          error={fieldErrors.validFrom}
        />
        <FormField
          label="Expiry"
          type="datetime-local"
          value={values.validTo}
          onChange={(e) => set("validTo", e.target.value)}
          required
          error={fieldErrors.validTo}
        />
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

/** ISO -> the local `YYYY-MM-DDTHH:mm` shape a `datetime-local` input needs — local time, not UTC, so an existing coupon's dates round-trip through the form unchanged. */
export function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function toRupeesValue(paise: number | null): string {
  return paise === null ? "" : String(paiseToRupees(paise));
}
