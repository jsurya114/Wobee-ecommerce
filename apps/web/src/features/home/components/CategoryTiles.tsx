import Link from "next/link";
import type { Category } from "@/features/catalog/api/categories.client";

// A small, fixed set of tint/text pairings from the existing token scale —
// cycles through the 5 real categories, not per-category art direction
// (no per-category imagery exists yet).
const TONES = ["bg-primary-tint text-primary", "bg-background text-text-primary", "bg-primary-tint text-primary", "bg-background text-text-primary"];

/**
 * "Shop by category" tile row — the real 5 seeded categories in the doc's
 * circular-tile pattern (§8, item 3). `flex-wrap justify-center`: the row is
 * centred on every width, and wraps to more centred rows on narrow screens
 * rather than overflowing or needing a scroll.
 */
export function CategoryTiles({ categories }: { categories: Category[] }) {
  if (categories.length === 0) return null;

  return (
    <section className="px-4 py-10 sm:px-6">
      <h2 className="mb-6 text-center font-display text-2xl text-text-primary">Shop by category</h2>

      <ul className="mx-auto flex max-w-4xl flex-wrap justify-center gap-x-8 gap-y-6 sm:gap-x-12">
        {categories.map((category, i) => (
          <li key={category.id}>
            <Link href={`/products?category=${encodeURIComponent(category.slug)}`} className="group flex flex-col items-center gap-2">
              <span
                className={`flex h-20 w-20 items-center justify-center rounded-full font-display text-lg transition-transform duration-200 group-hover:scale-105 sm:h-24 sm:w-24 ${TONES[i % TONES.length]}`}
              >
                {category.name.slice(0, 1)}
              </span>
              <span className="font-body text-xs text-text-primary">{category.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
