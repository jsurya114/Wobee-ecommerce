import Link from "next/link";
import { cn } from "@woobe/ui";
import type { Category } from "../api/categories.client";
import { buildProductsHref, type ProductsQueryParams } from "../lib/build-products-href";

/**
 * Plain links so the filter works without JS and each state is a real,
 * shareable URL (horizontally scrollable, not wrapping, on mobile —
 * woobe_ui_design_plan.md §9's "filters as a scrollable row, not a
 * sidebar"). Week 2 Day 1: switching category now preserves every other
 * active filter (search, size, color, sort, ...) via buildProductsHref,
 * not just category on its own.
 */
export function CategoryFilter({
  categories,
  activeSlug,
  currentParams,
}: {
  categories: Category[];
  activeSlug?: string;
  currentParams: ProductsQueryParams;
}) {
  const pill = (isActive: boolean) =>
    cn(
      "shrink-0 rounded-pill border px-4 py-2 font-body text-sm transition-colors",
      isActive ? "border-primary bg-primary text-white" : "border-border text-text-primary hover:border-primary hover:bg-primary-tint",
    );

  return (
    <nav
      aria-label="Filter by category"
      className="mb-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <Link href={buildProductsHref({ ...currentParams, category: undefined })} aria-current={!activeSlug || undefined} className={pill(!activeSlug)}>
        All
      </Link>
      {categories.map((category) => (
        <Link
          key={category.id}
          href={buildProductsHref({ ...currentParams, category: category.slug })}
          aria-current={activeSlug === category.slug || undefined}
          className={pill(activeSlug === category.slug)}
        >
          {category.name}
        </Link>
      ))}
    </nav>
  );
}
