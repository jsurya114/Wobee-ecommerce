"use client";

import { LoadingState } from "@/features/shell/components/LoadingState";
import { Button, Card } from "@woobe/ui";
import { useState } from "react";
import { toast } from "sonner";
import { useFormError } from "@/lib/use-form-error";
import { useAdminAppConfig } from "../hooks/useAdminStoreSettings";
import { PresetListEditor } from "./PresetListEditor";

type PresetKey = "presetSizes" | "presetFabrics" | "presetFits";
const GROUPS: { key: PresetKey; label: string }[] = [
  { key: "presetSizes", label: "Sizes" },
  { key: "presetFabrics", label: "Fabrics" },
  { key: "presetFits", label: "Fits" },
];

/** Product Presets (2026-09-28) — the options the variant form's Size / Fabric / Fit dropdowns offer. Existing variants keep whatever value they already have. */
export function ProductPresetsForm() {
  const { config, loading, error, update, isSaving } = useAdminAppConfig();
  const [draft, setDraft] = useState<Record<PresetKey, string[]> | null>(null);
  const { fieldErrors, formError, handle, clear } = useFormError();

  if (loading) return <LoadingState />;
  if (error || !config) return <p className="py-6 text-center font-body text-sm text-error">{error ?? "Couldn't load presets."}</p>;

  const values = draft ?? {
    presetSizes: config.presetSizes,
    presetFabrics: config.presetFabrics,
    presetFits: config.presetFits,
  };

  const onSave = async () => {
    clear();
    try {
      await update(values);
      setDraft(null);
      toast.success("Product presets updated");
    } catch (err) {
      handle(err, "Couldn't save the presets. Try again.");
    }
  };

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div>
        <h2 className="mb-1 font-body text-sm font-medium text-text-primary">Product presets</h2>
        <p className="font-body text-sm text-text-secondary">
          Options offered in the variant form. Removing one doesn't change existing variants.
        </p>
      </div>
      {GROUPS.map(({ key, label }) => (
        <PresetListEditor
          key={key}
          label={label}
          values={values[key]}
          error={fieldErrors[key]}
          onChange={(next) => setDraft({ ...values, [key]: next })}
        />
      ))}
      {formError ? (
        <p role="alert" className="font-body text-sm text-error">
          {formError}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={onSave} isLoading={isSaving} disabled={!draft}>
          Save presets
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
            disabled={isSaving}
          >
            Discard changes
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
