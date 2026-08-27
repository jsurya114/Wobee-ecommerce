import Link from "next/link";
import { cn } from "@woobe/ui";
import type { Collection } from "../api/collections.client";
import { buildProductsHref, type ProductsQueryParams } from "../lib/build-products-href";

/**
 * Collection filter — same plain-link, scrollable-pill pattern as
 * CategoryFilter (works without JS, each state a real shareable URL). Only
 * rendered when there's at least one active collection to show. Selecting a
 * collection preserves every other active filter (category, search, etc.) —
 * see buildProductsHref.
 */
export function CollectionFilter({
  collections,
  activeSlug,
  currentParams,
}: {
  collections: Collection[];
  activeSlug?: string;
  currentParams: ProductsQueryParams;
}) {
  if (collections.length === 0) return null;

  const pill = (isActive: boolean) =>
    cn(
      "shrink-0 rounded-pill border px-4 py-2 font-body text-sm transition-colors",
      isActive ? "border-primary bg-primary text-white" : "border-border text-text-primary hover:border-primary hover:bg-primary-tint",
    );

  return (
    <nav
      aria-label="Filter by collection"
      className="mb-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <Link
        href={buildProductsHref({ ...currentParams, collection: undefined })}
        aria-current={!activeSlug || undefined}
        className={pill(!activeSlug)}
      >
        All collections
      </Link>
      {collections.map((collection) => (
        <Link
          key={collection.id}
          href={buildProductsHref({ ...currentParams, collection: collection.slug })}
          aria-current={activeSlug === collection.slug || undefined}
          className={pill(activeSlug === collection.slug)}
        >
          {collection.name}
        </Link>
      ))}
    </nav>
  );
}
