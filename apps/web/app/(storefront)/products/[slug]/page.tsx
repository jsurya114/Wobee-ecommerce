import { paiseToRupees } from "@woobe/utils";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { listReviews } from "@/features/reviews/api/reviews.client";
import { getProductBySlug, getRelatedProducts, type ProductDetail } from "@/features/catalog/api/products.client";
import { ProductDetail as ProductDetailView } from "@/features/catalog/components/ProductDetail";
import { ApiError } from "@/lib/api-client";
import { FLOATING_STACK_GAP_REM, MOBILE_BOTTOM_NAV_HEIGHT_REM, PDP_PURCHASE_DOCK_HEIGHT_REM } from "@/lib/layout-constants";
import { absoluteUrl } from "@/lib/site-url";
import { JsonLd } from "@/lib/JsonLd";

/**
 * Mobile bottom clearance for the fixed purchase dock (2026-09-04 PDP
 * refinement) — computed from the same layout constants the dock itself
 * (`ProductPurchasePanel`) and its `useWhatsAppBottomOffset` collision math
 * use, not a static guess (per the refinement brief's own "do not solve this
 * with excessive static padding" instruction). Reserves the TALLER
 * two-row-dock height always: the server can't know here whether this
 * visitor's live cart will render the dock's weight row (that's
 * client-side-only cart state), and a little extra breathing room under a
 * shorter dock is a far smaller problem than content clipped under a taller
 * one. `--pdp-bottom-clearance` (not a plain inline `paddingBottom`) is the
 * same CSS-custom-property trick `WhatsAppButton` already uses so `md:pb-8`
 * can still win in the cascade at the desktop breakpoint, where there's no
 * fixed dock at all.
 */
const PDP_BOTTOM_CLEARANCE_STYLE = {
  "--pdp-bottom-clearance": `calc(${MOBILE_BOTTOM_NAV_HEIGHT_REM} + ${FLOATING_STACK_GAP_REM} + ${PDP_PURCHASE_DOCK_HEIGHT_REM} + env(safe-area-inset-bottom) + 1rem)`,
} as CSSProperties;

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

  // Default page/pageSize (1/10) — the same first page ReviewsSection would
  // otherwise fetch client-side on mount. SSR-ing it here serves both the
  // JSON-LD aggregateRating below AND ReviewsSection's initial render (no
  // more separate pageSize:1 probe + a second client-side fetch of the same
  // page — 2026-09-02 perf audit fix).
  const initialReviews = await listReviews(product.id).catch(() => null); // Reviews being briefly unreachable shouldn't 500 the whole product page — just omit aggregateRating and let ReviewsSection fall back to its own client fetch.
  const ratingSummary = initialReviews?.ratingSummary ?? null;

  const relatedProducts = await getRelatedProducts(product.slug)
    .then((result) => result.products)
    .catch(() => []); // A transient failure just hides the "You may also like" section — it never 500s the PDP.

  const inStockVariant = product.variants.find((v) => v.inStock);
  const lowestPrice = product.variants.reduce<number | null>(
    (min, v) => (min === null || v.pricePaise < min ? v.pricePaise : min),
    null,
  );

  return (
    <main className="mx-auto max-w-5xl px-4 pb-[var(--pdp-bottom-clearance)] pt-8 sm:px-6 md:pb-8" style={PDP_BOTTOM_CLEARANCE_STYLE}>
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
      <ProductDetailView product={product} relatedProducts={relatedProducts} initialReviews={initialReviews} />
    </main>
  );
}
