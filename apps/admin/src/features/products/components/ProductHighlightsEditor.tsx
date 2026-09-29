"use client";

import { Button, Input } from "@woobe/ui";
import { MAX_PRODUCT_HIGHLIGHTS } from "@woobe/validation";
import { Plus, X } from "lucide-react";
import type { ProductHighlight } from "../api/admin-products.client";

/**
 * Label/value rows for a product's PDP "Key Highlights" (2026-09-29) — e.g.
 * Work: Sequin, Blouse attached: Yes. Free-form so every product type (saree,
 * kurta, bangle) can say what matters for it; the server re-validates with
 * productHighlightsSchema.
 */
export function ProductHighlightsEditor({
  rows,
  onChange,
  error,
}: {
  rows: ProductHighlight[];
  onChange: (rows: ProductHighlight[]) => void;
  error?: string;
}) {
  const update = (index: number, patch: Partial<ProductHighlight>) => onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const remove = (index: number) => onChange(rows.filter((_, i) => i !== index));

  return (
    <div className="flex flex-col gap-2">
      {rows.length > 0 ? (
        <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,3fr)_2.25rem] gap-2 font-body text-xs text-text-secondary sm:grid">
          <span>Label</span>
          <span>Value</span>
        </div>
      ) : null}
      {rows.map((row, index) => (
        <div key={index} className="grid grid-cols-[minmax(0,1fr)_2.25rem] gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_2.25rem]">
          <Input
            aria-label={`Highlight ${index + 1} label`}
            placeholder={index === 0 ? "e.g. Work" : "Label"}
            value={row.label}
            maxLength={30}
            onChange={(e) => update(index, { label: e.target.value })}
            className="h-10"
          />
          <button
            type="button"
            onClick={() => remove(index)}
            aria-label={`Remove highlight ${index + 1}`}
            className="flex h-10 items-center justify-center rounded-control text-text-secondary transition-colors hover:text-error sm:order-last"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
          <Input
            aria-label={`Highlight ${index + 1} value`}
            placeholder={index === 0 ? "e.g. Sequin" : "Value"}
            value={row.value}
            maxLength={60}
            onChange={(e) => update(index, { value: e.target.value })}
            className="col-span-1 h-10 sm:col-span-1"
          />
        </div>
      ))}
      {error ? (
        <p role="alert" className="font-body text-sm text-error">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onChange([...rows, { label: "", value: "" }])}
          disabled={rows.length >= MAX_PRODUCT_HIGHLIGHTS}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add highlight
        </Button>
        <span className="font-body text-xs text-text-secondary">
          {rows.length}/{MAX_PRODUCT_HIGHLIGHTS}
        </span>
      </div>
    </div>
  );
}

/** Client-side mirror of productHighlightsSchema: drops fully empty rows, flags half-filled rows and duplicate labels. */
export function validateHighlights(rows: ProductHighlight[]): { ok: true; rows: ProductHighlight[] } | { ok: false; error: string } {
  const trimmed = rows.map((row) => ({ label: row.label.trim(), value: row.value.trim() })).filter((row) => row.label || row.value);
  if (trimmed.some((row) => !row.label || !row.value)) {
    return { ok: false, error: "Each highlight needs both a label and a value." };
  }
  const labels = trimmed.map((row) => row.label.toLowerCase());
  if (new Set(labels).size !== labels.length) {
    return { ok: false, error: "Each highlight label can only be used once." };
  }
  return { ok: true, rows: trimmed };
}
