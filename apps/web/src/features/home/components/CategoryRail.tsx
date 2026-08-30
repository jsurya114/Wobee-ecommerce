import { SectionHeader } from "@woobe/ui";
import Link from "next/link";
import type { HomeCategoryTile } from "../api/home.client";

/**
 * Compact "shop by category" rail (redesign spec §B) — small round
 * thumbnails from real product imagery, horizontal scroll, tight labels.
 * Replaces the wrap-centered letter-avatar circles. A category with no
 * imaged product falls back to a tinted circle with its initial (no
 * invented imagery).
 */
export function CategoryRail({ categories }: { categories: HomeCategoryTile[] }) {
  if (categories.length === 0) return null;

  return (
    <section className="px-4 pt-4 pb-section sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionHeader>Categories</SectionHeader>
        <ul className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
          {categories.map((category) => (
            <li key={category.id} className="shrink-0">
              <Link
                href={`/products?category=${encodeURIComponent(category.slug)}`}
                className="group flex w-16 flex-col items-center gap-1.5 text-center"
              >
                <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-surface-2 ring-1 ring-border transition-transform group-hover:scale-105 motion-reduce:transition-none">
                  {category.imageUrl ? (
                    <img
                      src={category.imageUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="font-display text-lg text-primary">{category.name.slice(0, 1)}</span>
                  )}
                </span>
                <span className="font-body text-micro leading-tight text-text-primary">{category.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
