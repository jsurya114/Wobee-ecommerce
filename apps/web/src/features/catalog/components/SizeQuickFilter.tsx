"use client";

import { Button, Chip, Sheet, cn } from "@woobe/ui";
import { Ruler } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ProductSort } from "../api/products.client";
import { useFilterResultCount } from "../hooks/useFilterResultCount";
import { buildProductsHref, parseProductsQueryParams, type ProductsQueryParams } from "../lib/build-products-href";
import { PLP_CONTROL_BUTTON_CLASS, SIZE_OPTIONS } from "../lib/filter-options";

/**
 * Size-first quick filter (redesign spec §13/§15) — Woobe is a surplus/
 * thrift business where the same product may exist in only one size or a
 * handful, so size needs to be reachable in one tap, not buried as one more
 * fieldset inside the general filter sheet. This sits to the *left* of the
 * "Filters" trigger on the PLP control row and opens its own small sheet
 * with nothing but size chips — the full `FiltersPanel` sheet still repeats
 * Size at the top of its own facet list (for anyone who opens that one
 * directly), both reading/writing the exact same `?size=` URL param via
 * `buildProductsHref`, so neither can drift out of sync with the other.
 */
export function SizeQuickFilter({ currentParams }: { currentParams: ProductsQueryParams }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sizes, setSizes] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setSizes(currentParams.size ? currentParams.size.split(",") : []);
  }, [open, currentParams.size]);

  const pendingQuery = {
    ...parseProductsQueryParams(currentParams),
    sort: currentParams.sort as ProductSort | undefined,
    size: sizes.length > 0 ? sizes : undefined,
  };
  const { count } = useFilterResultCount(pendingQuery, { enabled: open });

  const activeSizes = currentParams.size ? currentParams.size.split(",") : [];
  const activeCount = activeSizes.length;
  // One selected size names it directly ("Size: M") — the compact control
  // bar has no room to spell out more than one, so 2+ falls back to a count.
  const triggerLabel = activeCount === 1 ? `Size: ${activeSizes[0]}` : activeCount > 1 ? `Size (${activeCount})` : "Size";

  function toggleSize(size: string) {
    setSizes((prev) => (prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]));
  }

  function apply() {
    router.push(buildProductsHref({ ...currentParams, size: sizes.length > 0 ? sizes.join(",") : undefined }));
    setOpen(false);
  }

  function clear() {
    setSizes([]);
    router.push(buildProductsHref({ ...currentParams, size: undefined }));
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={cn(
          PLP_CONTROL_BUTTON_CLASS,
          activeCount > 0 ? "border-primary bg-primary text-white" : "border-border bg-surface text-text-primary hover:border-primary",
        )}
      >
        <Ruler className="h-4 w-4" aria-hidden="true" />
        {triggerLabel}
      </button>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Shop by size"
        footer={
          <div className="flex gap-3">
            <Button type="button" variant="secondary" size="sm" onClick={clear} className="flex-1">
              Clear
            </Button>
            <Button type="button" size="sm" onClick={apply} className="flex-1">
              {count != null ? `Show ${count} result${count === 1 ? "" : "s"}` : "Show results"}
            </Button>
          </div>
        }
      >
        <p className="mb-3 font-body text-xs text-text-secondary">
          Woobe pieces are surplus stock — most styles exist in only one or two sizes, so this is the fastest way to see what's actually
          available in yours.
        </p>
        <div className="flex flex-wrap gap-2">
          {SIZE_OPTIONS.map((size) => (
            <Chip key={size} active={sizes.includes(size)} onClick={() => toggleSize(size)}>
              {size}
            </Chip>
          ))}
        </div>
      </Sheet>
    </>
  );
}
