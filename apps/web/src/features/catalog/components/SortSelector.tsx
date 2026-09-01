"use client";

import { cn, Sheet } from "@woobe/ui";
import { ArrowUpDown, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProductSort } from "../api/products.client";
import { buildProductsHref, type ProductsQueryParams } from "../lib/build-products-href";
import { PLP_CONTROL_BUTTON_CLASS, SORT_OPTIONS } from "../lib/filter-options";

/**
 * Compact sort control (redesign spec §16) — a single-select bottom sheet
 * replacing the old native `<select>`. A sort choice commits immediately
 * (no "Apply" step — there's nothing to batch, unlike the multi-facet
 * filter sheets) and closes itself.
 *
 * `currentParams.sort` is only set once the shopper has actually picked one
 * (page.tsx no longer defaults it into the URL/display) — the trigger reads
 * plain "Sort" until then, and the short per-option label after, matching
 * the compact control-bar row (the sheet's own list still shows full labels).
 */
export function SortSelector({ currentParams }: { currentParams: ProductsQueryParams }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const explicitSort = currentParams.sort as ProductSort | undefined;
  const currentOption = explicitSort ? SORT_OPTIONS.find((option) => option.value === explicitSort) : undefined;
  const triggerLabel = currentOption ? `Sort: ${currentOption.shortLabel}` : "Sort";
  // The sheet still highlights the effectively-applied sort (the backend's
  // own default is price_asc) even before the shopper has explicitly chosen
  // one — only the compact trigger label stays generic until they do.
  const effectiveSort = explicitSort ?? "price_asc";

  function select(value: ProductSort) {
    router.push(buildProductsHref({ ...currentParams, sort: value }));
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={cn(PLP_CONTROL_BUTTON_CLASS, "border-border bg-surface text-text-primary hover:border-primary")}
      >
        <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
        {triggerLabel}
      </button>

      <Sheet open={open} onOpenChange={setOpen} title="Sort by">
        <ul className="flex flex-col">
          {SORT_OPTIONS.map((option) => {
            const isSelected = option.value === effectiveSort;
            return (
              <li key={option.value}>
                <button
                  type="button"
                  onClick={() => select(option.value)}
                  aria-current={isSelected || undefined}
                  className={`flex w-full items-center justify-between rounded-control px-3 py-3 text-left font-body text-sm transition-colors ${
                    isSelected ? "font-semibold text-primary" : "text-text-primary hover:bg-surface-2"
                  }`}
                >
                  {option.label}
                  {isSelected ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </>
  );
}
