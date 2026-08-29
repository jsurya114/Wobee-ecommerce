import { paiseToRupees } from "@woobe/utils";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listReviews } from "@/features/reviews/api/reviews.client";
import { getProductBySlug, type ProductDetail } from "@/features/catalog/api/products.client";
import { ProductDetail as ProductDetailView } from "@/features/catalog/components/ProductDetail";
import { ApiError } from "@/lib/api-client";
import { absoluteUrl } from "@/lib/site-url";
import { JsonLd } from "@/lib/JsonLd";

async function loadProduct(slug: string): Promise<ProductDetail | null> {
  return getProductBySlug(slug)
    .then((result) => result.product)
    .catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    });
}

/**
 * Real per-product SEO (Week 2 Day 9, week2 (1).md §19: "Metadata,
 * Canonical, OpenGraph, Product structured data, Availability, Price").
 * `getProductBySlug` is called again in the page component below — Next's
 * automatic `fetch` request memoization (App Router) dedupes identical
 * calls within one render pass, so this is one real network round trip,
 * not two.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await loadProduct(slug);

  if (!product) {
    return { title: "Product not found", robots: { index: false, follow: false } };
  }

  const title = product.metaTitle ?? product.name;
  const description = product.metaDescription ?? product.description ?? `Shop ${product.name} at Woobe — fashion, by weight.`;
  const image = product.images[0];
  const canonical = `/products/${product.slug}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website", // schema.org/OG's dedicated "product" og:type needs the (rarely supported) Product Metadata OG extension; JSON-LD below carries the real structured product data instead.
      title,
      description,
      url: canonical,
      images: image ? [{ url: absoluteUrl(image.url), alt: image.altText }] : undefined,
    },
  };
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const product = await loadProduct(slug);
  if (!product) {
    notFound();
  }

  // pageSize: 1 — this call only needs `ratingSummary`, which the API
  // returns alongside the first page of items regardless of how many are
  // requested; ReviewsSection (a client component) fetches its own actual
  // review list separately, so there's no point over-fetching here.
  const ratingSummary = await listReviews(product.id, 1, 1)
    .then((result) => result.ratingSummary)
    .catch(() => null); // Reviews being briefly unreachable shouldn't 500 the whole product page — just omit aggregateRating from the structured data.

  const inStockVariant = product.variants.find((v) => v.inStock);
  const lowestPrice = product.variants.reduce<number | null>(
    (min, v) => (min === null || v.pricePaise < min ? v.pricePaise : min),
    null,
  );

  return (
    <main className="mx-auto max-w-5xl px-4 pb-28 pt-8 sm:px-6 md:pb-8">
      {lowestPrice !== null ? (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "Product",
            name: product.name,
            description: product.description ?? undefined,
            image: product.images.map((img) => absoluteUrl(img.url)),
            brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
            category: product.category.name,
            offers: {
              "@type": "AggregateOffer",
              priceCurrency: "INR",
              lowPrice: paiseToRupees(lowestPrice),
              highPrice: paiseToRupees(product.variants.reduce((max, v) => Math.max(max, v.pricePaise), lowestPrice)),
              offerCount: product.variants.length,
              availability: inStockVariant ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
              url: absoluteUrl(`/products/${product.slug}`),
            },
            aggregateRating:
              ratingSummary && ratingSummary.reviewCount > 0
                ? { "@type": "AggregateRating", ratingValue: ratingSummary.averageRating, reviewCount: ratingSummary.reviewCount }
                : undefined,
          }}
        />
      ) : null}
      <ProductDetailView product={product} />
    </main>
  );
}
