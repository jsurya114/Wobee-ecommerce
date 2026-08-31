import { SectionHeader } from "@woobe/ui";
import Link from "next/link";
import type { HomeBudgetTile } from "../api/home.client";

/**
 * Discovery by final selling price (redesign spec §B) — Woobe-appropriate:
 * the shopper browses by what they'll actually pay. Uses the existing
 * `maxPrice` catalogue filter (paise). 2026-08-31: image cards, not pill
 * links — `imageUrl` is the cheapest qualifying product's own real photo
 * (resolved server-side in GetHomePageUseCase, same `/api/v1/home` call,
 * no extra request), not invented art. `price_desc` so the best items under
 * the cap surface first on the filtered page.
 */
export function ShopByBudget({ tiles }: { tiles: HomeBudgetTile[] }) {
  if (tiles.length === 0) return null;

  return (
    <section className="px-4 py-section sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionHeader>Shop by budget</SectionHeader>
        <div className="grid grid-cols-3 gap-2.5">
          {tiles.map((tile) => (
            <Link
              key={tile.maxPricePaise}
              href={`/products?maxPrice=${tile.maxPricePaise}&sort=price_desc`}
              className="group block overflow-hidden rounded-card bg-surface-2"
            >
              <div className="relative aspect-square overflow-hidden">
                {tile.imageUrl ? (
                  <img
                    src={tile.imageUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transform-none"
                  />
                ) : (
                  <div className="h-full w-full bg-primary-tint" />
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-2 pb-1.5 pt-4">
                  <span className="font-body text-[11px] font-semibold text-white sm:text-xs">{tile.label}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
