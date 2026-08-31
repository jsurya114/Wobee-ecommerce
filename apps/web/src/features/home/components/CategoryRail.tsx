import Link from "next/link";
import type { HomeCategoryTile } from "../api/home.client";

/**
 * Category navigation strip (redesign spec §B) — a full-width band directly
 * under the site header: round category thumbnails from real product
 * imagery with a label beneath, the group visually centered and spread
 * across the page. A category with no imaged product falls back to a tinted
 * circle with its initial (no invented imagery).
 *
 * Responsive: desktop/tablet render the whole group centered on one row
 * (`justify-center`, spacing widens with the viewport); on mobile the row
 * becomes a touch-scrollable carousel — `min-w-max` keeps each item at its
 * natural size and the `overflow-x-auto` wrapper scrolls, so the first item
 * is never clipped off the scrollable start and the component never causes
 * page-level horizontal overflow.
 *
 * Data + routing are unchanged: one `HomeCategoryTile[]` from `GET
 * /api/v1/home`, each item links to `/products?category=<slug>`.
 */
export function CategoryRail({ categories }: { categories: HomeCategoryTile[] }) {
  if (categories.length === 0) return null;

  return (
    <section aria-label="Shop by category" className="border-b border-border">
      <h2 className="sr-only">Shop by category</h2>
      <nav className="overflow-x-auto px-4 py-4 [-ms-overflow-style:none] [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden">
        <ul className="mx-auto flex min-w-max items-start justify-center gap-7 sm:gap-10 md:min-w-0 md:max-w-6xl md:gap-14 lg:gap-20 xl:gap-24">
          {categories.map((category) => (
            <li key={category.id} className="shrink-0">
              <Link
                href={`/products?category=${encodeURIComponent(category.slug)}`}
                className="group flex w-16 flex-col items-center gap-2 text-center sm:w-[4.5rem] lg:w-20"
              >
                <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-full bg-surface-2 ring-1 ring-border transition group-hover:ring-2 group-hover:ring-primary motion-reduce:transition-none">
                  {category.imageUrl ? (
                    <img
                      src={category.imageUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transform-none"
                    />
                  ) : (
                    <span className="font-display text-xl text-primary">{category.name.slice(0, 1)}</span>
                  )}
                </span>
                <span className="flex min-h-[2.4em] items-start justify-center font-body text-micro font-medium uppercase leading-tight tracking-[0.05em] text-text-secondary transition-colors group-hover:text-text-primary sm:text-xs">
                  {category.name}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}
