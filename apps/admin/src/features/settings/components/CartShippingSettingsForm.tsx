"use client";

import { LoadingState } from "@/features/shell/components/LoadingState";
import { Button, Card, FormField } from "@woobe/ui";
import { paiseToRupeeInput, parseRupeeInputToPaise } from "@woobe/utils";
import { useState } from "react";
import { toast } from "sonner";
import { useFormError } from "@/lib/use-form-error";
import type { ShippingRulePatch } from "../api/admin-settings.client";
import { useAdminAppConfig, useAdminShippingRule } from "../hooks/useAdminStoreSettings";

interface Draft {
  minWeightGrams: string;
  minQuantity: string;
  freeDeliveryGrams: string;
  standardFeeRupees: string;
  freeDeliverySubtotalRupees: string;
}

function parseGrams(value: string): number | null {
  return /^\d+$/.test(value.trim()) ? Number(value.trim()) : null;
}

/**
 * Cart & Shipping Rules (2026-09-28). Weight in grams, money typed in ₹ and
 * converted to integer paise only at submit (parseRupeeInputToPaise). Weight
 * and fee rules save as a new ShippingRule version; the minimum item count
 * lives in AppConfig — only the fields that actually changed are sent.
 */
export function CartShippingSettingsForm() {
  const shipping = useAdminShippingRule();
  const store = useAdminAppConfig();
  const [draft, setDraft] = useState<Draft | null>(null);
  const { fieldErrors, formError, handle, setFieldError, clear } = useFormError();

  if (shipping.loading || store.loading) return <LoadingState />;
  if (shipping.error || store.error || !shipping.rule || !store.config) {
    return <p className="py-6 text-center font-body text-sm text-error">{shipping.error ?? store.error ?? "Couldn't load settings."}</p>;
  }

  const rule = shipping.rule;
  const config = store.config;
  const current: Draft = {
    minWeightGrams: String(rule.minWeightGramsForCheckout),
    minQuantity: String(config.minCartQuantity),
    freeDeliveryGrams: String(rule.freeDeliveryThresholdGrams),
    standardFeeRupees: paiseToRupeeInput(rule.standardFeePaise),
    freeDeliverySubtotalRupees: paiseToRupeeInput(rule.freeDeliveryMinSubtotalPaise),
  };
  const values = draft ?? current;
  const set = (key: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...values, [key]: e.target.value });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clear();
    const minWeight = parseGrams(values.minWeightGrams);
    const freeGrams = parseGrams(values.freeDeliveryGrams);
    const minQuantity = parseGrams(values.minQuantity);
    const fee = parseRupeeInputToPaise(values.standardFeeRupees, {
      allowZero: true,
    });
    const freeSubtotal = parseRupeeInputToPaise(values.freeDeliverySubtotalRupees, { allowZero: true });

    const problems: [string, string][] = [];
    if (minWeight === null) problems.push(["minWeightGramsForCheckout", "Enter a whole number of grams."]);
    if (freeGrams === null) problems.push(["freeDeliveryThresholdGrams", "Enter a whole number of grams."]);
    if (minQuantity === null || minQuantity < 1) problems.push(["minCartQuantity", "Enter a whole number, at least 1."]);
    if (!fee.ok) problems.push(["standardFeePaise", fee.error]);
    if (!freeSubtotal.ok) problems.push(["freeDeliveryMinSubtotalPaise", freeSubtotal.error]);
    problems.forEach(([field, message]) => setFieldError(field, message));
    if (problems.length > 0 || minWeight === null || freeGrams === null || minQuantity === null || !fee.ok || !freeSubtotal.ok) return;

    const shippingPatch: ShippingRulePatch = {};
    if (minWeight !== rule.minWeightGramsForCheckout) shippingPatch.minWeightGramsForCheckout = minWeight;
    if (freeGrams !== rule.freeDeliveryThresholdGrams) shippingPatch.freeDeliveryThresholdGrams = freeGrams;
    if (fee.paise !== rule.standardFeePaise) shippingPatch.standardFeePaise = fee.paise;
    if (freeSubtotal.paise !== rule.freeDeliveryMinSubtotalPaise) shippingPatch.freeDeliveryMinSubtotalPaise = freeSubtotal.paise;
    const quantityChanged = minQuantity !== config.minCartQuantity;

    if (Object.keys(shippingPatch).length === 0 && !quantityChanged) {
      setDraft(null);
      return;
    }
    try {
      if (Object.keys(shippingPatch).length > 0) await shipping.update(shippingPatch);
      if (quantityChanged) await store.update({ minCartQuantity: minQuantity });
      setDraft(null);
      toast.success("Cart & shipping rules updated");
    } catch (err) {
      handle(err, "Couldn't save the rules. Try again.");
    }
  };

  return (
    <Card className="p-4">
      <h2 className="mb-1 font-body text-sm font-medium text-text-primary">Cart &amp; shipping rules</h2>
      <p className="mb-4 font-body text-sm text-text-secondary">
        Checked at checkout on every order. Changes apply immediately and never alter orders already placed.
      </p>
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2" noValidate>
        <FormField
          label="Minimum cart weight (grams)"
          inputMode="numeric"
          value={values.minWeightGrams}
          onChange={set("minWeightGrams")}
          error={fieldErrors.minWeightGramsForCheckout}
          helperText={fieldErrors.minWeightGramsForCheckout ? undefined : "Weight-priced items only. 1000 = 1 kg."}
        />
        <FormField
          label="Minimum number of items"
          inputMode="numeric"
          value={values.minQuantity}
          onChange={set("minQuantity")}
          error={fieldErrors.minCartQuantity}
        />
        <FormField
          label="Standard delivery fee (₹)"
          inputMode="decimal"
          value={values.standardFeeRupees}
          onChange={set("standardFeeRupees")}
          error={fieldErrors.standardFeePaise}
        />
        <FormField
          label="Free delivery from weight (grams)"
          inputMode="numeric"
          value={values.freeDeliveryGrams}
          onChange={set("freeDeliveryGrams")}
          error={fieldErrors.freeDeliveryThresholdGrams}
        />
        <FormField
          label="Free delivery from order value (₹)"
          inputMode="decimal"
          value={values.freeDeliverySubtotalRupees}
          onChange={set("freeDeliverySubtotalRupees")}
          error={fieldErrors.freeDeliveryMinSubtotalPaise}
          helperText={
            fieldErrors.freeDeliveryMinSubtotalPaise
              ? undefined
              : "Items total before coupons. 0 turns this off. Either free-delivery rule qualifies."
          }
        />
        {formError ? (
          <p role="alert" className="font-body text-sm text-error sm:col-span-2">
            {formError}
          </p>
        ) : null}
        <div className="flex items-center gap-2 sm:col-span-2">
          <Button type="submit" size="sm" isLoading={shipping.isSaving || store.isSaving}>
            Save
          </Button>
          {draft ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setDraft(null);
                clear();
              }}
            >
              Cancel
            </Button>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
