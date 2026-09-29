"use client";

import { Button, Card, FormField } from "@woobe/ui";
import { paiseToRupeeInput, parseRupeeInputToPaise } from "@woobe/utils";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { LoadingState } from "@/features/shell/components/LoadingState";
import { ImageUploadField } from "@/features/shell/components/ImageUploadField";
import { useFormError } from "@/lib/use-form-error";
import type { BudgetTile } from "../api/admin-settings.client";
import { useAdminAppConfig } from "../hooks/useAdminStoreSettings";

const MAX_TILES = 6;

/** One editable row. `key` is local only (stable React key while rows are added/removed); the price stays a rupee string until save. */
interface TileDraft {
  key: number;
  label: string;
  maxPriceRupees: string;
  coverImageUrl: string;
}

type RowErrors = Partial<Record<"label" | "maxPrice", string>>;

let nextKey = 0;
function toDraft(tile: BudgetTile): TileDraft {
  return { key: nextKey++, label: tile.label, maxPriceRupees: paiseToRupeeInput(tile.maxPricePaise), coverImageUrl: tile.coverImageUrl ?? "" };
}

/**
 * Homepage "Shop by Budget" tiles (2026-09-29) — label, max price (₹, saved
 * as integer paise), optional cover image. Saved together as one
 * `budgetTiles` array; the storefront shows them in this order.
 */
export function BudgetTilesForm() {
  const { config, loading, error, update, isSaving } = useAdminAppConfig();
  const [draft, setDraft] = useState<TileDraft[] | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<number, RowErrors>>({});
  const { fieldErrors, formError, handle, setFieldError, clear } = useFormError();
  // Stable row keys for the saved tiles (not re-minted every render), so an upload started before the first edit keeps its row.
  const savedRows = useMemo(() => config?.budgetTiles.map(toDraft) ?? [], [config]);

  if (loading) return <LoadingState />;
  if (error || !config) return <p className="py-6 text-center font-body text-sm text-error">{error ?? "Couldn't load budget tiles."}</p>;

  const rows = draft ?? savedRows;
  const edit = (next: TileDraft[]) => setDraft(next);
  const setRow = (key: number, patch: Partial<TileDraft>) => edit(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const reset = () => {
    setDraft(null);
    setRowErrors({});
    clear();
  };

  const onSave = async () => {
    clear();
    const errors: Record<number, RowErrors> = {};
    const tiles: BudgetTile[] = [];
    const seenPrices = new Set<number>();
    for (const row of rows) {
      const rowError: RowErrors = {};
      const label = row.label.trim();
      if (!label) rowError.label = "Label is required";
      const price = parseRupeeInputToPaise(row.maxPriceRupees);
      if (!price.ok) rowError.maxPrice = price.error;
      else if (seenPrices.has(price.paise)) rowError.maxPrice = "Another tile already uses this price";
      if (price.ok) seenPrices.add(price.paise);
      if (rowError.label || rowError.maxPrice) errors[row.key] = rowError;
      else if (price.ok) tiles.push({ label, maxPricePaise: price.paise, coverImageUrl: row.coverImageUrl || null });
    }
    setRowErrors(errors);
    if (rows.length === 0) {
      setFieldError("budgetTiles", "Keep at least one tile");
      return;
    }
    if (Object.keys(errors).length > 0) return;

    try {
      await update({ budgetTiles: tiles });
      reset();
      toast.success("Shop by Budget updated");
    } catch (err) {
      handle(err, "Couldn't save the tiles. Try again.");
    }
  };

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div>
        <h2 className="mb-1 font-body text-sm font-medium text-text-primary">Shop by budget</h2>
        <p className="font-body text-sm text-text-secondary">
          Price tiles on the homepage, in this order. Each links to products at or under its price. Three or six tiles fill the rows evenly.
        </p>
      </div>

      <ol className="flex flex-col gap-3">
        {rows.map((row, index) => (
          <li key={row.key} className="flex flex-col gap-3 rounded-control border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="font-body text-xs font-medium uppercase tracking-wide text-text-secondary">Tile {index + 1}</span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => edit(rows.filter((other) => other.key !== row.key))}
                disabled={rows.length <= 1 || isSaving}
              >
                Delete
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Label" value={row.label} placeholder="Under ₹499" onChange={(e) => setRow(row.key, { label: e.target.value })} error={rowErrors[row.key]?.label} />
              <FormField
                label="Max price (₹)"
                inputMode="decimal"
                value={row.maxPriceRupees}
                placeholder="499"
                onChange={(e) => setRow(row.key, { maxPriceRupees: e.target.value })}
                error={rowErrors[row.key]?.maxPrice}
              />
            </div>
            <ImageUploadField
              label="Cover image (optional)"
              value={row.coverImageUrl}
              onChange={(url) => setRow(row.key, { coverImageUrl: url })}
              altText={row.label || "Budget tile cover"}
              emptyHint="Uses a product photo in this budget"
            />
          </li>
        ))}
      </ol>

      {fieldErrors.budgetTiles || formError ? (
        <p role="alert" className="font-body text-sm text-error">
          {fieldErrors.budgetTiles ?? formError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => edit([...rows, { key: nextKey++, label: "", maxPriceRupees: "", coverImageUrl: "" }])}
          disabled={rows.length >= MAX_TILES || isSaving}
        >
          Add tile
        </Button>
        <Button type="button" size="sm" onClick={() => void onSave()} isLoading={isSaving} disabled={!draft}>
          Save tiles
        </Button>
        {draft ? (
          <Button type="button" variant="secondary" size="sm" onClick={reset} disabled={isSaving}>
            Cancel
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
