import { buttonVariants } from "@woobe/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCollectionBySlug } from "@/features/catalog/api/collections.client";
import { listProducts } from "@/features/catalog/api/products.client";
import { ProductGrid } from "@/features/catalog/components/ProductGrid";
import { ApiError } from "@/lib/api-client";

// Reads live catalogue/collection data per-request (ADR-026's rule) — no
// `dynamic` export needed since it doesn't read searchParams and has no
// other reason Next would try to statically generate it at build time
// (this route isn't in generateStaticParams either), but the data itself is
// always fetched fresh per-request regardless.
const RAIL_LIMIT = 12;

/**
 * SEO-friendly collection URL (week2 (1).md §4). Metadata is real —
 * generated per-collection from the collection's own name/description, not
 * a static fallback — so each collection gets its own <title>/description
 * in search results and link previews.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const result = await getCollectionBySlug(slug).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  });

  if (!result) {
    return { title: "Collection not found — Woobe" };
  }

  const description = result.collection.description ?? `Shop the ${result.collection.name} collection at Woobe — fashion, by weight.`;
  return {
    title: `${result.collection.name} — Woobe`,
    description,
    openGraph: { title: result.collection.name, description },
  };
}

export default async function CollectionDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const result = await getCollectionBySlug(slug).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  });

  if (!result) {
    notFound();
  }

  const { collection } = result;

  // 404 on an unknown collection slug is handled the same way products'
  // own ?collection= filter treats it elsewhere in this app — but the
  // detail call above already 404'd first if the slug were truly unknown,
  // so this call only ever runs for a collection that exists.
  const productsResult = await listProducts({ collection: slug, limit: RAIL_LIMIT, sort: "newest" });

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-3xl text-text-primary">{collection.name}</h1>
      {collection.description ? <p className="mt-2 max-w-2xl font-body text-sm text-text-secondary">{collection.description}</p> : null}

      <div className="mt-8">
        {productsResult.products.length === 0 ? (
          <p className="font-body text-sm text-text-secondary">Nothing in this collection yet — check back soon.</p>
        ) : (
          <>
            <ProductGrid products={productsResult.products} />
            {productsResult.total > RAIL_LIMIT ? (
              <div className="mt-8 flex justify-center">
                <Link href={`/products?collection=${encodeURIComponent(slug)}`} className={buttonVariants({ variant: "secondary" })}>
                  View all {productsResult.total} items
                </Link>
              </div>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}
