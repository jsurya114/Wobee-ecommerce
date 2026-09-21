import { SectionHeader, cn } from "@woobe/ui";
import Link from "next/link";
import type { HomeCategoryTile } from "../api/home.client";

/**
 * Category navigation strip (redesign spec §B) — sits below the promo
 * carousel, under a compact "Shop by category" `SectionHeader`. Round
 * category thumbnails from real product imagery with a centered label
 * beneath. A category with no imaged product falls back to a tinted circle
 * with its initial (no invented imagery).
 *
 * Mobile layout (mobile UI refinement, 2026-09-21): the row is sized from
 * the available width, not from a fixed circle size, so the first five
 * categories fill the row edge-to-edge (12px side inset, 6px gaps) instead
 * of leaving dead space either side of small circles.
 *  - 5 or fewer categories: every item is `flex-1` — they share the row
 *    equally, so the row is always full, and no scrolling exists.
 *  - more than 5: each item is exactly one fifth of the row (minus gaps),
 *    so five are visible at once and the rest scroll horizontally
 *    (scroll-snap) — nothing is hidden, "See all" is unchanged.
 * The circle is `w-full` of its column with `aspect-square`, capped at
 * 4.9rem (78px) so it stays in the ~68–78px band on 375–430px phones and
 * shrinks gracefully (not clipped) at 320px. Labels stay on a single line
 * (wrapping to two lines was itself a reported problem, 2026-09-04) at a
 * viewport-scaled font size, so "Accessories"/"Ethnic Wear" still fit a
 * column at 320px.
 *
 * `md:` and up keep the original centered, fixed-size row (16px circles,
 * widening gaps) — desktop is unchanged.
 *
 * Data + routing are unchanged: one `HomeCategoryTile[]` from `GET
 * /api/v1/home`, each item links to `/products?category=<slug>`. Only
 * top-level categories are shown here — see the "subcategories" note on
 * `Category.parentId` in schema.prisma for how a deeper catalogue would
 * extend this without changing this component's own shape.
 */
export function CategoryRail({ categories }: { categories: HomeCategoryTile[] }) {
  if (categories.length === 0) return null;
  const fitsInRow = categories.length <= 5;

  return (
    <section aria-label="Shop by category" className="pb-3 pt-3 sm:px-6">
      <div className="mx-auto max-w-6xl px-4 sm:px-0">
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
      <nav className="overflow-x-auto px-3 [-ms-overflow-style:none] [scrollbar-width:none] sm:px-0 [&::-webkit-scrollbar]:hidden">
        <ul className="mx-auto flex snap-x snap-proximity items-start gap-1.5 sm:min-w-max sm:justify-center sm:gap-7 md:min-w-0 md:max-w-6xl md:gap-9 lg:gap-11">
          {categories.map((category) => (
            <li
              key={category.id}
              className={cn(
                "snap-start",
                fitsInRow
                  ? "min-w-0 flex-1 sm:flex-none"
                  : "min-w-0 shrink-0 basis-[calc((100%-1.5rem)/5)] sm:basis-auto",
              )}
            >
              <Link
                href={`/products?category=${encodeURIComponent(category.slug)}`}
                className="group flex flex-col items-center gap-2 text-center transition-transform active:scale-95 motion-reduce:transition-none"
              >
                <span className="flex aspect-square w-full max-w-[4.9rem] shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/70 bg-surface-2 transition group-hover:border-primary motion-reduce:transition-none sm:h-16 sm:w-16">
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
                <span className="whitespace-nowrap font-body text-[clamp(0.59rem,2.75vw,0.6875rem)] font-medium leading-tight text-text-secondary transition-colors group-hover:text-text-primary">
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
