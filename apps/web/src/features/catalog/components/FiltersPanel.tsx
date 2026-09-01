"use client";

import { Button, Chip, Label, Sheet, cn } from "@woobe/ui";
import { SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ProductSort } from "../api/products.client";
import { useFilterResultCount } from "../hooks/useFilterResultCount";
import { buildProductsHref, parseProductsQueryParams, type ProductsQueryParams } from "../lib/build-products-href";
import { SIZE_OPTIONS } from "../lib/filter-options";

/**
 * The full PLP filter sheet (redesign spec §14) — Size, Colour, Price,
 * Availability. Sort moved out to its own `SortSelector` (it isn't a facet
 * you narrow by, it's an ordering, and it never needed the multi-select
 * "Apply" pattern the rest of this sheet uses). Size is repeated here (also
 * reachable via the standalone `SizeQuickFilter` on the control row) so
 * anyone who opens "Filters" directly still meets it first, largest, and
 * before every other facet — both surfaces read/write the same `?size=` URL
 * param via `buildProductsHref`, so there's nothing to keep in sync by hand.
 *
 * Pending edits live in local state and are only committed to the URL (a
 * real navigation, a real server-filtered result) on "Show results" — the
 * shopper can flip through every facet without losing earlier choices or
 * triggering a page change per click.
 */
function activeFilterCount(params: ProductsQueryParams): number {
  return [params.size, params.color, params.inStock, params.minPrice, params.maxPrice].filter(Boolean).length;
}

function paiseToRupeeString(paise: string | undefined): string {
  if (!paise) return "";
  const value = Number(paise);
  return Number.isFinite(value) ? String(Math.round(value / 100)) : "";
}

export function FiltersPanel({ currentParams }: { currentParams: ProductsQueryParams }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const [sizes, setSizes] = useState<string[]>([]);
  const [color, setColor] = useState("");
  const [inStock, setInStock] = useState(false);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

  useEffect(() => {
    if (!open) return;
    setSizes(currentParams.size ? currentParams.size.split(",") : []);
    setColor(currentParams.color ?? "");
    setInStock(Boolean(currentParams.inStock));
    setMinPrice(paiseToRupeeString(currentParams.minPrice));
    setMaxPrice(paiseToRupeeString(currentParams.maxPrice));
  }, [open, currentParams]);

  const count = activeFilterCount(currentParams);

  const minRupees = minPrice !== "" ? Number(minPrice) : undefined;
  const maxRupees = maxPrice !== "" ? Number(maxPrice) : undefined;
  const pendingQuery = {
    ...parseProductsQueryParams(currentParams),
    sort: currentParams.sort as ProductSort | undefined,
    size: sizes.length > 0 ? sizes : undefined,
    color: color.trim() ? [color.trim()] : undefined,
    inStock: inStock ? true : undefined,
    minPrice: minRupees != null && Number.isFinite(minRupees) ? Math.round(minRupees * 100) : undefined,
    maxPrice: maxRupees != null && Number.isFinite(maxRupees) ? Math.round(maxRupees * 100) : undefined,
  };
  const { count: previewCount } = useFilterResultCount(pendingQuery, { enabled: open });

  function apply() {
    router.push(
      buildProductsHref({
        ...currentParams,
        size: sizes.length > 0 ? sizes.join(",") : undefined,
        color: color.trim() || undefined,
        inStock: inStock ? "true" : undefined,
        minPrice: minRupees != null && Number.isFinite(minRupees) ? String(Math.round(minRupees * 100)) : undefined,
        maxPrice: maxRupees != null && Number.isFinite(maxRupees) ? String(Math.round(maxRupees * 100)) : undefined,
      }),
    );
    setOpen(false);
  }

  function clearAll() {
    // Category / collection have their own "All" reset and read as page navigation, not part of this set.
    router.push(
      buildProductsHref({ category: currentParams.category, collection: currentParams.collection, q: currentParams.q, sort: currentParams.sort }),
    );
    setOpen(false);
  }

  function toggleSize(size: string) {
    setSizes((prev) => (prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]));
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        Filters{count > 0 ? ` (${count})` : ""}
      </Button>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Filters"
        footer={
          <div className="flex gap-3">
            <Button type="button" variant="secondary" size="sm" onClick={clearAll} className="flex-1">
              Clear all
            </Button>
            <Button type="button" size="sm" onClick={apply} className="flex-1">
              {previewCount != null ? `Show ${previewCount} result${previewCount === 1 ? "" : "s"}` : "Show results"}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-6">
          <fieldset>
            <legend className="mb-2 font-body text-sm font-semibold text-text-primary">Size</legend>
            <div className="flex flex-wrap gap-2">
              {SIZE_OPTIONS.map((size) => (
                <Chip key={size} active={sizes.includes(size)} onClick={() => toggleSize(size)}>
                  {size}
                </Chip>
              ))}
            </div>
          </fieldset>

          <div className="border-t border-border pt-5">
            <Label htmlFor="filter-color" className="mb-1.5 block font-medium text-text-primary">
              Colour
            </Label>
            <input
              id="filter-color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="e.g. Rose"
              className={cn(
                "h-10 w-full rounded-control border border-border bg-surface px-3 font-body text-sm text-text-primary",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              )}
            />
          </div>

          <div className="border-t border-border pt-5">
            <Label className="mb-1.5 block font-medium text-text-primary">Price (₹)</Label>
            <div className="flex items-center gap-3">
              <input
                aria-label="Minimum price in rupees"
                type="number"
                min={0}
                inputMode="numeric"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                placeholder="Min"
                className="h-10 w-full rounded-control border border-border bg-surface px-3 font-body text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              <span className="text-text-secondary">–</span>
              <input
                aria-label="Maximum price in rupees"
                type="number"
                min={0}
                inputMode="numeric"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="Max"
                className="h-10 w-full rounded-control border border-border bg-surface px-3 font-body text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
          </div>

          <div className="border-t border-border pt-5">
            <Chip active={inStock} onClick={() => setInStock((v) => !v)}>
              In stock only
            </Chip>
          </div>
        </div>
      </Sheet>
    </>
  );
}
