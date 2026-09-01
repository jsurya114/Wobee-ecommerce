"use client";

import { Button, Chip, Sheet } from "@woobe/ui";
import { Ruler } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ProductSort } from "../api/products.client";
import { useFilterResultCount } from "../hooks/useFilterResultCount";
import { buildProductsHref, parseProductsQueryParams, type ProductsQueryParams } from "../lib/build-products-href";
import { SIZE_OPTIONS } from "../lib/filter-options";

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

  const activeCount = currentParams.size ? currentParams.size.split(",").length : 0;

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
      <Button
        type="button"
        variant={activeCount > 0 ? "primary" : "secondary"}
        size="sm"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <Ruler className="h-4 w-4" aria-hidden="true" />
        Size{activeCount > 0 ? ` (${activeCount})` : ""}
      </Button>

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
