"use client";

import useEmblaCarousel from "embla-carousel-react";
import { useCallback, useEffect, useState } from "react";
import { WishlistButton } from "@/features/wishlist/components/WishlistButton";
import type { ProductDetail } from "../api/products.client";
import { useSelectedVariant } from "../hooks/useSelectedVariant";
import { buildKeyHighlights, type KeyHighlight } from "../lib/build-key-highlights";
import { ShareProductButton } from "./ShareProductButton";

/**
 * PDP image gallery (redesign spec §F) — one Embla instance drives both the
 * mobile swipe (with dot indicators) and the desktop thumbnail strip. The
 * first image is eager + `fetchPriority="high"` (it's the page's LCP
 * element); the rest lazy.
 *
 * The SECOND slide carries a "Key Highlights" overlay (2026-09-29) — part of
 * that slide, so it scrolls in with it and is gone again on slide 1. Uses the
 * admin-curated highlights when set, else the selected variant's real data
 * (buildKeyHighlights).
 */
const MIN_HIGHLIGHT_ROWS = 2;

export function ProductGallery({ product }: { product: ProductDetail }) {
  const { images, id: productId, slug: productSlug, name: productName } = product;
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start", containScroll: "trimSnaps" });
  const [selected, setSelected] = useState(0);
  const { selectedVariantId } = useSelectedVariant();
  const selectedVariant = product.variants.find((variant) => variant.id === selectedVariantId);
  const { rows: highlights, curated } = buildKeyHighlights(product, selectedVariant);
  // An admin-curated list is shown even with one row (it was entered on purpose);
  // derived rows need at least two to be worth an overlay.
  const showHighlights = images.length > 1 && highlights.length >= (curated ? 1 : MIN_HIGHLIGHT_ROWS);

  const onSelect = useCallback(() => {
    if (emblaApi) setSelected(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect).on("reInit", onSelect);
  }, [emblaApi, onSelect]);

  const hasImages = images.length > 0;

  return (
    <div className="flex gap-3">
      {images.length > 1 ? (
        <div className="hidden w-16 shrink-0 flex-col gap-2 md:flex">
          {images.map((image, i) => (
            <button
              key={`${image.url}-${i}`}
              type="button"
              onClick={() => emblaApi?.scrollTo(i)}
              aria-label={`View image ${i + 1} of ${images.length}`}
              aria-current={selected === i ? "true" : undefined}
              className={`aspect-[3/4] overflow-hidden rounded-control border transition-colors ${
                selected === i ? "border-primary" : "border-border hover:border-text-secondary"
              }`}
            >
              <img src={image.url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}

      <div className="relative min-w-0 flex-1">
        <div className="overflow-hidden rounded-card bg-surface-2" ref={emblaRef}>
          <div className="flex">
            {hasImages ? (
              images.map((image, i) => (
                <div key={`${image.url}-${i}`} className="relative min-w-0 flex-[0_0_100%]">
                  <div className="aspect-[3/4]">
                    <img
                      src={image.url}
                      alt={image.altText || productName}
                      decoding="async"
                      loading={i === 0 ? "eager" : "lazy"}
                      fetchPriority={i === 0 ? "high" : undefined}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  {i === 1 && showHighlights ? <KeyHighlightsOverlay highlights={highlights} /> : null}
                </div>
              ))
            ) : (
              <div className="aspect-[3/4] flex-[0_0_100%]" />
            )}
          </div>
        </div>

        <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
          <WishlistButton productId={productId} variantId={selectedVariantId} />
          <ShareProductButton slug={productSlug} name={productName} />
        </div>

        {images.length > 1 ? (
          <div className="mt-2 flex justify-center gap-1.5 md:hidden">
            {images.map((image, i) => (
              <button
                key={`dot-${image.url}-${i}`}
                type="button"
                onClick={() => emblaApi?.scrollTo(i)}
                aria-label={`Go to image ${i + 1}`}
                aria-current={selected === i ? "true" : undefined}
                className={`h-1.5 rounded-pill transition-all ${selected === i ? "w-5 bg-primary" : "w-1.5 bg-border"}`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Editorial overlay inside the second slide: a bottom-weighted scrim keeps
 * the upper part of the product photo visible while giving the text enough
 * contrast; rows are label-over-value with hairline separators.
 */
function KeyHighlightsOverlay({ highlights }: { highlights: KeyHighlight[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/85 via-black/50 to-transparent p-4 sm:p-7">
      <section aria-label="Key highlights" className="max-w-xs">
        <h2 className="font-display text-lg leading-tight text-white sm:text-2xl">Key Highlights</h2>
        <dl className="mt-2 divide-y divide-white/15 sm:mt-3">
          {highlights.map((row) => (
            <div key={row.label} className="py-1.5 first:pt-0 last:pb-0 sm:py-2">
              <dt className="font-body text-[11px] font-medium uppercase tracking-[0.08em] text-white/70">{row.label}</dt>
              <dd className="mt-0.5 font-body text-sm font-medium text-white">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
