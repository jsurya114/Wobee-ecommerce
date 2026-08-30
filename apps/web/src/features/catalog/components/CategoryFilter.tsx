import Link from "next/link";
import { chipVariants } from "@woobe/ui";
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
  return (
    <nav
      aria-label="Filter by category"
      className="mb-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <Link
        href={buildProductsHref({ ...currentParams, category: undefined })}
        aria-current={!activeSlug || undefined}
        className={chipVariants({ active: !activeSlug })}
      >
        All
      </Link>
      {categories.map((category) => (
        <Link
          key={category.id}
          href={buildProductsHref({ ...currentParams, category: category.slug })}
          aria-current={activeSlug === category.slug || undefined}
          className={chipVariants({ active: activeSlug === category.slug })}
        >
          {category.name}
        </Link>
      ))}
    </nav>
  );
}
