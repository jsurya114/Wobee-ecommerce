"use client";

import { FormField, Input, Label, cn } from "@woobe/ui";
import { useId, useState } from "react";

const OTHER = "__other__";

interface PresetSelectProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  required?: boolean;
  error?: string;
}

/**
 * A dropdown over the admin-managed presets (Settings → Product presets) with
 * an "Other…" escape hatch that reveals a free-text field. A value that isn't
 * in the current preset list (an older variant, or a preset since removed)
 * opens in "Other" mode with its text intact, so editing never silently
 * blanks it. Without presets (settings failed to load) it degrades to a
 * plain text field.
 */
export function PresetSelect({ label, value, options, onChange, required = false, error }: PresetSelectProps) {
  const selectId = useId();
  const errorId = `${selectId}-error`;
  const [isOther, setIsOther] = useState(() => value !== "" && !options.includes(value));

  if (options.length === 0) {
    return <FormField label={label} value={value} onChange={(e) => onChange(e.target.value)} error={error} />;
  }

  const selectValue = isOther ? OTHER : value;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={selectId}>{label}</Label>
      <select
        id={selectId}
        name={label}
        value={selectValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => {
          if (e.target.value === OTHER) {
            setIsOther(true);
            onChange("");
          } else {
            setIsOther(false);
            onChange(e.target.value);
          }
        }}
        className={cn(
          "h-11 w-full rounded-control border bg-surface px-4 font-body text-base text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          error ? "border-error" : "border-border",
        )}
      >
        <option value="" disabled={required}>
          {required ? "Select…" : "— Select —"}
        </option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        <option value={OTHER}>Other…</option>
      </select>
      {isOther ? (
        <Input
          aria-label={`${label} — custom value`}
          value={value}
          invalid={Boolean(error)}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Type a ${label.toLowerCase().replace(/ \(optional\)$/, "")}`}
        />
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="font-body text-sm text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
