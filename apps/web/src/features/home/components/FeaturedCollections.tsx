import { SectionHeader } from "@woobe/ui";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { Collection } from "@/features/catalog/api/collections.client";

/**
 * "Featured collections" rail (Week 2 Day 8 Part 2, week2 (1).md §12).
 * 2026-08-31: image cards, not text-only — `coverImageUrl` is the
 * collection's own top-sorted assigned product's real photo (see
 * CollectionRepository.findActiveCollections), never invented art. A
 * collection with no products assigned yet falls back to a tinted panel
 * with its name, same "no fake imagery" rule as before.
 */
export function FeaturedCollections({ collections }: { collections: Collection[] }) {
  if (collections.length === 0) return null;

  return (
    <section className="px-4 py-section sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionHeader>Featured collections</SectionHeader>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {collections.map((collection) => (
            <Link key={collection.id} href={`/collections/${collection.slug}`} className="group block overflow-hidden rounded-card bg-surface-2">
              <div className="relative aspect-[4/3] overflow-hidden">
                {collection.coverImageUrl ? (
                  <img
                    src={collection.coverImageUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transform-none"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-primary-tint">
                    <span className="font-display text-lg text-primary">{collection.name}</span>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-3 pb-2.5 pt-6">
                  <h3 className="font-body text-xs font-semibold text-white sm:text-sm">{collection.name}</h3>
                  <span className="inline-flex items-center gap-0.5 font-body text-[11px] font-medium text-white/90">
                    Shop now
                    <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
