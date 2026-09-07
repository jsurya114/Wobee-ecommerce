import { SectionHeader, chipVariants } from "@woobe/ui";
import Link from "next/link";
import { buildProductsHref } from "@/features/catalog/lib/build-products-href";
import type { HomeSizeOption } from "../api/home.client";

/**
 * "Shop your size" (merchandising logic corrections, 2026-09-06 — homepage
 * audit finding E) — a compact discovery/navigation rail, not a product
 * grid: Woobe is surplus stock where most styles exist in only one or two
 * sizes, so getting a shopper to "does my size exist at all" in one tap
 * matters more here than for a normal retailer, same reasoning
 * `SizeQuickFilter`'s own sheet copy already states on the PLP. Reuses that
 * exact same routing contract (`?size=` via `buildProductsHref`) rather
 * than a second size-filtering implementation — clicking a pill here lands
 * on the real, already-filtered `/products` page.
 *
 * `sizes` arrives pre-filtered (server-side, GetHomePageUseCase) to only
 * the curated clothing sizes with at least one live variant right now, so
 * every pill shown here is guaranteed non-empty — no client-side count
 * fetch, no flash of a size that turns out to have zero results.
 *
 * Deliberately NOT the numeric footwear/jewelry sizes also present in the
 * DB (e.g. "37", "2.4") — seeing those alongside "M"/"L" would misrepresent
 * them as clothing sizes (homepage audit finding 5); they stay reachable
 * only through their own category's product listing, not this rail.
 */
export function ShopYourSize({ sizes }: { sizes: HomeSizeOption[] }) {
  if (sizes.length === 0) return null;

  return (
    <section aria-label="Shop your size" className="px-4 pb-3 pt-3 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionHeader>Shop your size</SectionHeader>
        <nav className="overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <ul className="flex min-w-max gap-2">
            {sizes.map((option) => (
              <li key={option.size}>
                <Link href={buildProductsHref({ size: option.size, sort: "newest" })} className={chipVariants({ size: "sm" })}>
                  {option.size}
                  <span className="text-text-secondary">· {option.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  );
}
