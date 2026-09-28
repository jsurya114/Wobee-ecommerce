"use client";

import { Button, Input } from "@woobe/ui";
import { X } from "lucide-react";
import { useId, useState } from "react";

interface PresetListEditorProps {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  error?: string;
}

/** Editable tag list for one preset group. Mirrors the server's rules (no commas, no case-insensitive duplicates) for instant feedback; the server re-validates regardless. */
export function PresetListEditor({ label, values, onChange, error }: PresetListEditorProps) {
  const inputId = useId();
  const [pending, setPending] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const add = () => {
    const value = pending.trim();
    if (!value) return;
    if (value.includes(",")) return setLocalError("A preset can't contain a comma.");
    if (values.some((v) => v.toLowerCase() === value.toLowerCase())) return setLocalError(`"${value}" is already in the list.`);
    onChange([...values, value]);
    setPending("");
    setLocalError(null);
  };

  const shownError = localError ?? error;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 font-body text-sm font-medium text-text-primary">{label}</legend>
      <ul className="flex flex-wrap gap-2" aria-label={`${label} presets`}>
        {values.map((value) => (
          <li
            key={value}
            className="inline-flex items-center gap-1 rounded-pill border border-border bg-surface px-3 py-1 font-body text-sm"
          >
            {value}
            <button
              type="button"
              onClick={() => onChange(values.filter((v) => v !== value))}
              disabled={values.length <= 1}
              className="rounded-full p-0.5 text-text-secondary hover:text-error disabled:opacity-40"
              aria-label={`Remove ${value}`}
              title={values.length <= 1 ? "Keep at least one option" : `Remove ${value}`}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          Add to {label}
        </label>
        <Input
          id={inputId}
          value={pending}
          placeholder={`Add ${label.toLowerCase().replace(/s$/, "")}`}
          onChange={(e) => {
            setPending(e.target.value);
            setLocalError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          className="max-w-xs"
        />
        <Button type="button" variant="secondary" size="sm" onClick={add}>
          Add
        </Button>
      </div>
      {shownError ? (
        <p role="alert" className="font-body text-sm text-error">
          {shownError}
        </p>
      ) : null}
    </fieldset>
  );
}
