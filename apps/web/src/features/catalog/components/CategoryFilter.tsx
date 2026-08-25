import Link from "next/link";
import { cn } from "@woobe/ui";
import type { Category } from "../api/categories.client";

/** Basic category-only filter (Day 3 scope — advanced search/sort is deferred, see week1_excecution_prompt.md). Plain links so the filter works without JS and each state is a real, shareable URL. */
export function CategoryFilter({ categories, activeSlug }: { categories: Category[]; activeSlug?: string }) {
  return (
    <nav className="mb-6 flex flex-wrap gap-2 font-body text-sm">
      <Link
        href="/products"
        className={cn(
          "rounded-pill border px-4 py-1.5 transition-colors",
          !activeSlug ? "border-primary bg-primary text-white" : "border-border text-text-primary hover:bg-primary-tint",
        )}
      >
        All
      </Link>
      {categories.map((category) => (
        <Link
          key={category.id}
          href={`/products?category=${encodeURIComponent(category.slug)}`}
          className={cn(
            "rounded-pill border px-4 py-1.5 transition-colors",
            activeSlug === category.slug
              ? "border-primary bg-primary text-white"
              : "border-border text-text-primary hover:bg-primary-tint",
          )}
        >
          {category.name}
        </Link>
      ))}
    </nav>
  );
}
