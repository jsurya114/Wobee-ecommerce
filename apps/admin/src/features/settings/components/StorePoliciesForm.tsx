"use client";

import { LoadingState } from "@/features/shell/components/LoadingState";
import { Card } from "@woobe/ui";
import { toast } from "sonner";
import { useAdminAppConfig } from "../hooks/useAdminStoreSettings";

interface PolicyToggleProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}

function PolicyToggle({ id, label, description, checked, disabled, onChange }: PolicyToggleProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="font-body text-sm font-medium text-text-primary">
          {label}
        </label>
        <p id={`${id}-description`} className="font-body text-sm text-text-secondary">
          {description}
        </p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={`${id}-description`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 ${
          checked ? "bg-primary" : "bg-border"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`}
        />
      </button>
    </div>
  );
}

/** Store Policies (2026-09-28) — feature switches saved immediately on toggle. */
export function StorePoliciesForm() {
  const { config, loading, error, update, isSaving } = useAdminAppConfig();

  if (loading) return <LoadingState />;
  if (error || !config) return <p className="py-6 text-center font-body text-sm text-error">{error ?? "Couldn't load policies."}</p>;

  const save = async (patch: Parameters<typeof update>[0], message: string) => {
    try {
      await update(patch);
      toast.success(message);
    } catch {
      toast.error("Couldn't save. Try again.");
    }
  };

  return (
    <Card className="flex flex-col gap-4 p-4">
      <h2 className="font-body text-sm font-medium text-text-primary">Store policies</h2>
      <PolicyToggle
        id="policy-returns"
        label="Customer returns"
        description="When off, customers can't request new returns. Returns already requested stay visible and can still be processed."
        checked={config.returnsEnabled}
        disabled={isSaving}
        onChange={(checked) => save({ returnsEnabled: checked }, checked ? "Returns turned on" : "Returns turned off")}
      />
      <PolicyToggle
        id="policy-cod-shipping-upfront"
        label="Collect COD delivery fee online"
        description="Cash-on-delivery orders with a delivery fee pay that fee online (Razorpay) before they are confirmed; the rest is paid in cash at the door. Only turn on once online payments work in this environment."
        checked={config.codShippingUpfront}
        disabled={isSaving}
        onChange={(checked) =>
          save({ codShippingUpfront: checked }, checked ? "COD delivery fee will be collected online" : "COD delivery fee collected at the door")
        }
      />
    </Card>
  );
}
