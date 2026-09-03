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
 * Label typography (2026-09-03 refinement pass 2): normal title case, not
 * uppercase-with-tracking — the category names already arrive title-cased
 * from the API ("Ethnic Wear"), so dropping `uppercase` is enough to show
 * them naturally; no data change.
 *
 * Each item's own column width is intrinsic to its content (the `<Link>`
 * has no fixed width), not pinned to the circle's fixed size — the circle
 * (`h-14 w-14`/`sm:h-16 sm:w-16`) is what's fixed, and `whitespace-nowrap`
 * keeps every label on a single line, so a wide two-word name like "Ethnic
 * Wear" simply gets a wider column (with the circle still centered above
 * it) instead of wrapping to two stacked lines — confirmed live,
 * 2026-09-04, that word-wrapping the label was itself the actual
 * complaint, not just how it wrapped (an earlier attempt on the same
 * report fixed a real char-level-wrap bug but kept the two-line result,
 * which was never what was wanted). No `min-h` trick needed for row
 * alignment now that every label is uniformly one line tall. Circle size
 * bumped back up (final refinement pass, 2026-09-03) — a prior pass
 * over-tightened these into a size too small to read as a real navigation
 * item. No bottom divider (removed, same pass): the transition into "New
 * arrivals" is carried by whitespace/typography, not a rule.
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
    <section aria-label="Shop by category" className="px-4 pb-3 pt-3 sm:px-6">
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
        <ul className="mx-auto flex min-w-max items-start justify-center gap-4 sm:gap-7 md:min-w-0 md:max-w-6xl md:gap-9 lg:gap-11">
          {categories.map((category) => (
            <li key={category.id} className="shrink-0">
              <Link
                href={`/products?category=${encodeURIComponent(category.slug)}`}
                className="group flex flex-col items-center gap-1.5 text-center transition-transform active:scale-95 motion-reduce:transition-none"
              >
                <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-2 transition group-hover:border-primary motion-reduce:transition-none sm:h-16 sm:w-16">
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
                <span className="whitespace-nowrap font-body text-[11px] font-medium leading-tight text-text-secondary transition-colors group-hover:text-text-primary">
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
