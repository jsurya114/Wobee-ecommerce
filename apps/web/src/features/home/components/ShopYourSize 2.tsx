import { SectionHeader } from "@woobe/ui";
import Link from "next/link";
import { buildProductsHref } from "@/features/catalog/lib/build-products-href";
import type { HomeSizeOption } from "../api/home.client";

/**
 * "ONE SIZE" (8 characters) can't share a type size with "S"/"M"/"L"
 * without either overflowing its card or forcing every other card to
 * match its width — the visual design brief's own "ONE SIZE can be
 * slightly smaller because of its length" call. Short clothing codes get
 * the display serif at full size; anything longer drops to a smaller
 * uppercase tracked label instead. `4` is the exact boundary between the
 * two real shapes this rail ever renders: XS/S/M/L/XL (≤2) and XXL (3) on
 * one side, "One Size" (8) on the other — nothing in between exists in
 * `CURATED_CLOTHING_SIZES` (apps/api's own home module).
 */
function sizeLabelClassName(size: string): string {
  return size.length > 4
    ? "font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-primary"
    : "font-display text-2xl leading-none text-primary";
}

/**
 * "Shop your size" (merchandising logic corrections, 2026-09-06 — homepage
 * audit finding E) — a compact discovery/navigation rail, not a product
 * grid: Woobe is surplus stock where most styles exist in only one or two
 * sizes, so getting a shopper to "does my size exist at all" in one tap
 * matters more here than for a normal retailer, same reasoning
 * `SizeQuickFilter`'s own sheet copy already states on the PLP. Reuses that
 * exact same routing contract (`?size=` via `buildProductsHref`) rather
 * than a second size-filtering implementation — clicking a card here lands
 * on the real, already-filtered `/products` page.
 *
 * `sizes` arrives pre-filtered (server-side, GetHomePageUseCase) to only
 * the curated clothing sizes with at least one live variant right now, so
 * every card shown here is guaranteed non-empty — no client-side count
 * fetch, no flash of a size that turns out to have zero results.
 *
 * Deliberately NOT the numeric footwear/jewelry sizes also present in the
 * DB (e.g. "37", "2.4") — seeing those alongside "M"/"L" would misrepresent
 * them as clothing sizes (homepage audit finding 5); they stay reachable
 * only through their own category's product listing, not this rail.
 *
 * Visual redesign (2026-09-11) — enhanced text badges, not icons: the size
 * text stays the primary semantic information (an icon-only treatment
 * would be ambiguous), upgraded from a plain filter-chip pill into a
 * compact two-line stat card (size, then item count as a visually
 * secondary caption) using the storefront's own ivory/blush/burgundy
 * language (`bg-surface`, `border-border`, `shadow-card`, `text-primary`)
 * instead of a generic chip fill, so it reads as editorial merchandising
 * rather than a dashboard filter row.
 */
export function ShopYourSize({ sizes }: { sizes: HomeSizeOption[] }) {
  if (sizes.length === 0) return null;

  return (
    <section aria-label="Shop your size" className="px-4 pb-3 pt-3 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionHeader>Shop your size</SectionHeader>
        <nav className="overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <ul className="flex min-w-max gap-2.5">
            {sizes.map((option) => (
              <li key={option.size}>
                <Link
                  href={buildProductsHref({ size: option.size, sort: "newest" })}
                  className="group flex h-[4.5rem] min-w-[4.25rem] flex-col items-center justify-center gap-1 rounded-card border border-border bg-surface px-3.5 shadow-card transition-colors hover:border-primary hover:bg-primary-tint/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
                >
                  <span className={sizeLabelClassName(option.size)}>{option.size}</span>
                  <span className="font-body text-[11px] leading-none text-text-secondary">
                    {option.count} item{option.count === 1 ? "" : "s"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  );
}
