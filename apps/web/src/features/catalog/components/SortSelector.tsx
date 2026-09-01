"use client";

import { Sheet } from "@woobe/ui";
import { ArrowUpDown, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ProductSort } from "../api/products.client";
import { buildProductsHref, type ProductsQueryParams } from "../lib/build-products-href";
import { SORT_OPTIONS } from "../lib/filter-options";

/**
 * Compact sort control (redesign spec §16) — a single-select bottom sheet
 * replacing the old native `<select>`. A sort choice commits immediately
 * (no "Apply" step — there's nothing to batch, unlike the multi-facet
 * filter sheets) and closes itself.
 */
export function SortSelector({ currentParams }: { currentParams: ProductsQueryParams }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const current = (currentParams.sort as ProductSort | undefined) ?? "price_asc";
  const currentLabel = SORT_OPTIONS.find((option) => option.value === current)?.label ?? "Sort";

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
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-pill border border-border bg-surface px-4 font-body text-sm text-text-primary transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
        {currentLabel}
      </button>

      <Sheet open={open} onOpenChange={setOpen} title="Sort by">
        <ul className="flex flex-col">
          {SORT_OPTIONS.map((option) => {
            const isSelected = option.value === current;
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
