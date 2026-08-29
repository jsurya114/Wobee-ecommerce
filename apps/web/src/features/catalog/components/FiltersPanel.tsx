"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Input, Label, cn } from "@woobe/ui";
import { buildProductsHref, type ProductsQueryParams } from "../lib/build-products-href";
import type { ProductSort } from "../api/products.client";

/**
 * Sort + size/color facets + in-stock + price range + clear, collapsed
 * behind a "Filters" disclosure toggle on every breakpoint. The design plan
 * (woobe_ui_design_plan.md §9) calls for this as a bottom sheet on mobile;
 * packages/ui has no Modal/Sheet primitive yet (its own index.ts says those
 * "arrive when a real feature needs that specific behavior" — ADR-022).
 * Building one from scratch wasn't this Day's scope, so this is a plain
 * inline disclosure instead — same filtering behavior, full-width panel
 * under the toggle rather than a portal/overlay sheet. Easy to swap for a
 * real Sheet once packages/ui has one; documented as a deliberate scope
 * call, not an oversight (see journal.md).
 *
 * Size options are a fixed, standard apparel set (exact match). Color is a
 * free-text exact-match input, not a curated swatch list — ProductVariant
 * .color is a freeform string, not an enum, and there's no facet-values
 * endpoint in Day 1's scope to source real options from; a hardcoded color
 * list risked silently not matching the actual catalogue. See journal.md.
 */
const SIZE_OPTIONS = ["S", "M", "L", "XL", "XXL", "One Size"];
const SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "newest", label: "Newest" },
];

function activeFilterCount(params: ProductsQueryParams): number {
  return [params.q, params.size, params.color, params.inStock, params.minPrice, params.maxPrice].filter(Boolean).length;
}

/** Filter inputs work in whole rupees — the API's minPrice/maxPrice are paise (DEVELOPMENT_RULES.md #4: money is always Int paise everywhere except this display boundary). */
function paiseToRupeeString(paise: string | undefined): string {
  if (!paise) return "";
  const value = Number(paise);
  return Number.isFinite(value) ? String(Math.round(value / 100)) : "";
}

export function FiltersPanel({ currentParams }: { currentParams: ProductsQueryParams }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState(currentParams.color ?? "");
  const [minPrice, setMinPrice] = useState(paiseToRupeeString(currentParams.minPrice));
  const [maxPrice, setMaxPrice] = useState(paiseToRupeeString(currentParams.maxPrice));

  const activeSizes = currentParams.size ? currentParams.size.split(",") : [];
  const count = activeFilterCount(currentParams);

  function navigate(next: Partial<ProductsQueryParams>) {
    router.push(buildProductsHref({ ...currentParams, ...next }));
  }

  function toggleSize(size: string) {
    const next = activeSizes.includes(size) ? activeSizes.filter((s) => s !== size) : [...activeSizes, size];
    navigate({ size: next.length > 0 ? next.join(",") : undefined });
  }

  function applyPriceAndColor(event: FormEvent) {
    event.preventDefault();
    const minRupees = minPrice !== "" ? Number(minPrice) : undefined;
    const maxRupees = maxPrice !== "" ? Number(maxPrice) : undefined;
    navigate({
      color: color.trim() || undefined,
      minPrice: minRupees !== undefined && Number.isFinite(minRupees) ? String(Math.round(minRupees * 100)) : undefined,
      maxPrice: maxRupees !== undefined && Number.isFinite(maxRupees) ? String(Math.round(maxRupees * 100)) : undefined,
    });
  }

  function clearFilters() {
    setColor("");
    setMinPrice("");
    setMaxPrice("");
    // Category/collection stay — those have their own "All" reset link and
    // read as page-level navigation, not part of this filter set.
    navigate({ q: undefined, size: undefined, color: undefined, inStock: undefined, minPrice: undefined, maxPrice: undefined, sort: undefined });
  }

  const pill = (isActive: boolean) =>
    cn(
      "shrink-0 rounded-pill border px-3 py-1.5 font-body text-sm transition-colors",
      isActive ? "border-primary bg-primary text-white" : "border-border text-text-primary hover:border-primary hover:bg-primary-tint",
    );

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-controls="catalogue-filters-panel"
        >
          Filters{count > 0 ? ` (${count})` : ""}
        </Button>

        <label htmlFor="product-sort" className="sr-only">
          Sort by
        </label>
        <select
          id="product-sort"
          value={currentParams.sort ?? "price_asc"}
          onChange={(e) => navigate({ sort: e.target.value as ProductSort })}
          className="h-9 rounded-control border border-border bg-surface px-3 font-body text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {count > 0 ? (
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        ) : null}
      </div>

      {open ? (
        <div id="catalogue-filters-panel" className="mt-4 flex flex-col gap-4 rounded-card border border-border p-4">
          <fieldset>
            {/* A <label> here (rather than <legend>) isn't associated with
                any single field — this groups several toggle buttons, not
                one form control — and was flagged as a real a11y issue by
                live browser verification (DevTools "No label associated
                with a form field"), not a hypothetical. */}
            <legend className="mb-2 font-body text-sm font-medium text-text-primary">Size</legend>
            <div className="flex flex-wrap gap-2">
              {SIZE_OPTIONS.map((size) => (
                <button
                  key={size}
                  type="button"
                  aria-pressed={activeSizes.includes(size)}
                  className={pill(activeSizes.includes(size))}
                  onClick={() => toggleSize(size)}
                >
                  {size}
                </button>
              ))}
            </div>
          </fieldset>

          <button
            type="button"
            aria-pressed={Boolean(currentParams.inStock)}
            className={pill(Boolean(currentParams.inStock))}
            onClick={() => navigate({ inStock: currentParams.inStock ? undefined : "true" })}
          >
            In stock only
          </button>

          <form onSubmit={applyPriceAndColor} className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-3">
            <div className="flex-1">
              <Label htmlFor="filter-color" className="mb-1.5 block">
                Color
              </Label>
              <Input
                id="filter-color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="e.g. Rose"
              />
            </div>
            <div className="flex gap-3">
              <div>
                <Label htmlFor="filter-min-price" className="mb-1.5 block">
                  Min ₹
                </Label>
                <Input
                  id="filter-min-price"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  className="w-24"
                />
              </div>
              <div>
                <Label htmlFor="filter-max-price" className="mb-1.5 block">
                  Max ₹
                </Label>
                <Input
                  id="filter-max-price"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  className="w-24"
                />
              </div>
            </div>
            <Button type="submit" size="sm">
              Apply
            </Button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
