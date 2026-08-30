"use client";

import useEmblaCarousel from "embla-carousel-react";
import { useCallback, useEffect, useState } from "react";
import { WishlistButton } from "@/features/wishlist/components/WishlistButton";
import type { ProductImage } from "../api/products.client";

/**
 * PDP image gallery (redesign spec §F) — one Embla instance drives both the
 * mobile swipe (with dot indicators) and the desktop thumbnail strip. The
 * first image is eager + `fetchPriority="high"` (it's the page's LCP
 * element); the rest lazy.
 */
export function ProductGallery({ images, productId, productName }: { images: ProductImage[]; productId: string; productName: string }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start", containScroll: "trimSnaps" });
  const [selected, setSelected] = useState(0);

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
                </div>
              ))
            ) : (
              <div className="aspect-[3/4] flex-[0_0_100%]" />
            )}
          </div>
        </div>

        <WishlistButton productId={productId} className="absolute right-3 top-3" />

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
