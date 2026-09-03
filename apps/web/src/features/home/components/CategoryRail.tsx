import { SectionHeader } from "@woobe/ui";
import Link from "next/link";
import type { HomeCategoryTile } from "../api/home.client";

/**
 * Category navigation strip (redesign spec §B) — sits below the promo
 * carousel (2026-08-31 reorder), with a visible compact "Shop by category"
 * label (was `sr-only`) matching every other section's `SectionHeader`.
 * Round category thumbnails from real product imagery with a label
 * beneath, the group visually centered and spread across the page. A
 * category with no imaged product falls back to a tinted circle with its
 * initial (no invented imagery).
 *
 * Responsive: desktop/tablet render the whole group centered on one row
 * (`justify-center`, spacing widens with the viewport); on mobile the row
 * becomes a touch-scrollable carousel — `min-w-max` keeps each item at its
 * natural size and the `overflow-x-auto` wrapper scrolls, so the first item
 * is never clipped off the scrollable start and the component never causes
 * page-level horizontal overflow.
 *
 * Data + routing are unchanged: one `HomeCategoryTile[]` from `GET
 * /api/v1/home`, each item links to `/products?category=<slug>`. Only
 * top-level categories are shown here — see the "subcategories" note on
 * `Category.parentId` in schema.prisma for how a deeper catalogue would
 * extend this without changing this component's own shape.
 */
export function CategoryRail({ categories }: { categories: HomeCategoryTile[] }) {
  if (categories.length === 0) return null;

  return (
    <section aria-label="Shop by category" className="border-b border-border px-4 py-section sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          action={
            <Link href="/products" className="hover:underline">
              See all
            </Link>
          }
        >
          Shop by category
        </SectionHeader>
      </div>
      <nav className="overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ul className="mx-auto flex min-w-max items-start justify-center gap-5 sm:gap-8 md:min-w-0 md:max-w-6xl md:gap-10 lg:gap-12">
          {categories.map((category) => (
            <li key={category.id} className="shrink-0">
              <Link
                href={`/products?category=${encodeURIComponent(category.slug)}`}
                className="group flex w-11 flex-col items-center gap-1 text-center sm:w-12 lg:w-[3.25rem]"
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
                    <span className="font-display text-sm text-primary">{category.name.slice(0, 1)}</span>
                  )}
                </span>
                <span className="flex min-h-[2em] items-start justify-center font-body text-[10px] font-medium uppercase leading-tight tracking-[0.03em] text-text-secondary transition-colors group-hover:text-text-primary">
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
