import Link from "next/link";
import { cn } from "@woobe/ui";
import type { Category } from "../api/categories.client";

/**
 * Basic category-only filter (Day 3 scope — advanced search/sort is
 * deferred, see week1_excecution_prompt.md). Plain links so the filter
 * works without JS and each state is a real, shareable URL. Horizontally
 * scrollable, not wrapping, on mobile (woobe_ui_design_plan.md §9 — filters
 * as a scrollable row, not a sidebar).
 */
export function CategoryFilter({ categories, activeSlug }: { categories: Category[]; activeSlug?: string }) {
  const pill = (isActive: boolean) =>
    cn(
      "shrink-0 rounded-pill border px-4 py-2 font-body text-sm transition-colors",
      isActive ? "border-primary bg-primary text-white" : "border-border text-text-primary hover:border-primary hover:bg-primary-tint",
    );

  return (
    <nav
      aria-label="Filter by category"
      className="mb-6 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <Link href="/products" className={pill(!activeSlug)}>
        All
      </Link>
      {categories.map((category) => (
        <Link key={category.id} href={`/products?category=${encodeURIComponent(category.slug)}`} className={pill(activeSlug === category.slug)}>
          {category.name}
        </Link>
      ))}
    </nav>
  );
}
