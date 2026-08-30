import { SectionHeader } from "@woobe/ui";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { Collection } from "@/features/catalog/api/collections.client";

/**
 * "Featured collections" rail (Week 2 Day 8 Part 2, week2 (1).md §12) —
 * text/description cards, not imagery: Collection has no media field in
 * the schema (checked before writing this), so a card built around a
 * placeholder image would be exactly the kind of invented content Module
 * 12's own "do not invent" list rules out.
 */
export function FeaturedCollections({ collections }: { collections: Collection[] }) {
  if (collections.length === 0) return null;

  return (
    <section className="px-4 py-section sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionHeader>Featured collections</SectionHeader>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {collections.map((collection) => (
          <Link
            key={collection.id}
            href={`/collections/${collection.slug}`}
            className="group flex flex-col justify-between gap-3 rounded-card border border-border bg-surface p-4 transition-colors hover:border-primary"
          >
            <div>
              <h3 className="font-body text-sm font-semibold text-text-primary">{collection.name}</h3>
              {collection.description ? (
                <p className="mt-1 line-clamp-2 font-body text-xs text-text-secondary">{collection.description}</p>
              ) : null}
            </div>
            <span className="inline-flex items-center gap-1 font-body text-xs font-medium text-primary">
              Shop now
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </Link>
        ))}
        </div>
      </div>
    </section>
  );
}
