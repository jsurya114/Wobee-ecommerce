"use client";

import { Button, Chip, Label, Sheet, cn } from "@woobe/ui";
import { SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { buildProductsHref, type ProductsQueryParams } from "../lib/build-products-href";
import type { ProductSort } from "../api/products.client";

/**
 * PLP filters + sort (redesign spec §G). Filters open in a bottom `Sheet`
 * (accessible dialog — focus trap, Esc, scroll lock, returns focus): the
 * shopper adjusts size / colour / price / availability and commits with
 * "Apply", or "Clear". Sort is a compact inline control that navigates
 * immediately. Only backend-supported facets are exposed — no fabricated
 * filters, no weight facet (deferred, see spec §O).
 */
const SIZE_OPTIONS = ["S", "M", "L", "XL", "XXL", "One Size"];
const SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "newest", label: "Newest" },
];

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

  // Pending sheet state — committed only on "Apply".
  const [sizes, setSizes] = useState<string[]>([]);
  const [color, setColor] = useState("");
  const [inStock, setInStock] = useState(false);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

  // Re-seed the pending state from the URL every time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setSizes(currentParams.size ? currentParams.size.split(",") : []);
    setColor(currentParams.color ?? "");
    setInStock(Boolean(currentParams.inStock));
    setMinPrice(paiseToRupeeString(currentParams.minPrice));
    setMaxPrice(paiseToRupeeString(currentParams.maxPrice));
  }, [open, currentParams]);

  const count = activeFilterCount(currentParams);

  function apply() {
    const minRupees = minPrice !== "" ? Number(minPrice) : undefined;
    const maxRupees = maxPrice !== "" ? Number(maxPrice) : undefined;
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
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        Filters{count > 0 ? ` (${count})` : ""}
      </Button>

      <label htmlFor="product-sort" className="sr-only">
        Sort by
      </label>
      <select
        id="product-sort"
        value={currentParams.sort ?? "price_asc"}
        onChange={(e) => router.push(buildProductsHref({ ...currentParams, sort: e.target.value as ProductSort }))}
        className="h-9 rounded-control border border-border bg-surface px-3 font-body text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {count > 0 ? (
        <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
          Clear
        </Button>
      ) : null}

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Filters"
        footer={
          <div className="flex gap-3">
            <Button type="button" variant="secondary" size="sm" onClick={clearAll} className="flex-1">
              Clear
            </Button>
            <Button type="button" size="sm" onClick={apply} className="flex-1">
              Apply
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-5">
          <fieldset>
            <legend className="mb-2 font-body text-sm font-medium text-text-primary">Size</legend>
            <div className="flex flex-wrap gap-2">
              {SIZE_OPTIONS.map((size) => (
                <Chip key={size} size="sm" active={sizes.includes(size)} onClick={() => toggleSize(size)}>
                  {size}
                </Chip>
              ))}
            </div>
          </fieldset>

          <div>
            <Chip size="sm" active={inStock} onClick={() => setInStock((v) => !v)}>
              In stock only
            </Chip>
          </div>

          <div>
            <Label htmlFor="filter-color" className="mb-1.5 block">
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

          <div>
            <Label className="mb-1.5 block">Price (₹)</Label>
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
        </div>
      </Sheet>
    </div>
  );
}
