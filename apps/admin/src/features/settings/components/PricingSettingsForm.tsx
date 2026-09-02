"use client";

import { LoadingState } from "@/features/shell/components/LoadingState";
import { Button, Card, FormField } from "@woobe/ui";
import { paiseToRupees, rupeesToPaise } from "@woobe/utils";
import { useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { useAdminPricingSetting } from "../hooks/useAdminPricingSetting";

/**
 * The one place the admin manages weight-based pricing (2026-09-02) —
 * a single global ₹/kg rate, not a per-product or per-variant value. The
 * input takes whole rupees for admin readability (₹1,200, not 120000) and
 * converts to integer paise only at this display boundary
 * (rupeesToPaise/paiseToRupees, DEVELOPMENT_RULES.md #4) — the server
 * receives and stores paise, never rupees, and never a float.
 */
export function PricingSettingsForm() {
  const { setting, loading, error, updateRate, isSaving } = useAdminPricingSetting();
  const [draftRupees, setDraftRupees] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const currentRupees = setting ? paiseToRupees(setting.ratePerKgPaise) : null;
  const value = draftRupees ?? (currentRupees != null ? String(currentRupees) : "");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);
    const rupees = Number(value);
    if (!value.trim() || !Number.isFinite(rupees) || rupees <= 0) {
      setFieldError("Enter a positive rate in rupees per kg.");
      return;
    }
    try {
      await updateRate(rupeesToPaise(rupees));
      setDraftRupees(null);
      toast.success("Pricing rate updated");
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && err.fieldErrors) {
        setFieldError(Object.values(err.fieldErrors)[0]?.[0] ?? err.message);
      } else {
        toast.error(err instanceof ApiError ? err.message : "Couldn't save the rate. Try again.");
      }
    }
  };

  if (loading) {
    return <LoadingState />;
  }
  if (error) {
    return <p className="py-12 text-center font-body text-sm text-error">{error}</p>;
  }

  return (
    <Card className="max-w-md p-4">
      <h2 className="mb-1 font-body text-sm font-medium text-text-primary">Weight pricing</h2>
      <p className="mb-4 font-body text-sm text-text-secondary">
        Applies to every weight-priced product. Not a per-product or per-variant setting.
      </p>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <FormField
          label="₹ / kg"
          type="number"
          min={1}
          step="1"
          value={value}
          error={fieldError ?? undefined}
          helperText={
            !fieldError && currentRupees != null && setting
              ? `Effective since ${new Date(setting.effectiveFrom).toLocaleString("en-IN")}`
              : undefined
          }
          onChange={(e) => setDraftRupees(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" isLoading={isSaving}>
            Save
          </Button>
          {draftRupees !== null ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => setDraftRupees(null)} disabled={isSaving}>
              Cancel
            </Button>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
