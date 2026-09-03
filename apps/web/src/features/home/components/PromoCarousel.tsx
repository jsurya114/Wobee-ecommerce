"use client";

import useEmblaCarousel from "embla-carousel-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { HomeBanner } from "../api/home.client";

const AUTOPLAY_INTERVAL_MS = 5000;

/**
 * Defense-in-depth for `banner.ctaUrl` (security review, 2026-08-31) — the
 * write-side schema (`packages/validation/src/banners.schema.ts`'s
 * `ctaUrlSchema`) already rejects anything that isn't a `/`-relative path
 * or an `http(s)://` URL, so a `javascript:`/`data:` value can't be saved
 * through the admin form. This is a second, independent check at the
 * render site itself — same allowlist, so a future write path that skips
 * the schema (a direct DB edit, a bulk import) still can't reach `<Link
 * href>` with an unsafe scheme.
 */
function isSafeHref(url: string): boolean {
  return url.startsWith("/") || /^https:\/\//i.test(url) || /^http:\/\//i.test(url);
}

/**
 * Homepage promo carousel (UI refinement pass, 2026-08-31; taller mobile
 * hero, 2026-09-03 refinement pass 2) — admin-managed slides (banners
 * module), rendered here purely from what `GET /api/v1/home` already
 * returned (no extra request). `aspect-[8/5]` on mobile (~11% taller than
 * the prior `16/9`) gives the model/product image room to breathe as the
 * page's primary focal point after the brand/search area, while staying
 * capped well short of a full-height hero — the homepage is still
 * shopping-first. `sm:` and up keeps its own wider ratio + height cap.
 *
 * Autoplay is a plain `setInterval` (no animation library) and is skipped
 * entirely under `prefers-reduced-motion: reduce`; any manual interaction
 * (drag or a control click) stops it for the rest of the session rather
 * than fighting the visitor's own navigation.
 */
export function PromoCarousel({ banners }: { banners: HomeBanner[] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: banners.length > 1 });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const autoplayEnabled = useRef(true);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect).on("reInit", onSelect);
  }, [emblaApi, onSelect]);

  // Stop autoplay the moment the visitor takes control — a swipe/drag or a
  // manual prev/next/dot click all count (`emblaApi`'s own "pointerDown" and
  // this component's own button handlers below).
  useEffect(() => {
    if (!emblaApi) return;
    const stop = () => {
      autoplayEnabled.current = false;
    };
    emblaApi.on("pointerDown", stop);
    return () => {
      emblaApi.off("pointerDown", stop);
    };
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi || banners.length <= 1) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const id = window.setInterval(() => {
      if (!autoplayEnabled.current) return;
      emblaApi.scrollNext();
    }, AUTOPLAY_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [emblaApi, banners.length]);

  if (banners.length === 0) return null;

  return (
    <section aria-roledescription="carousel" aria-label="Promotions" className="px-4 pb-1 pt-3 sm:px-6">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-card" ref={emblaRef}>
        <div className="flex">
          {banners.map((banner, index) => (
            <div key={banner.id} className="relative min-w-0 flex-[0_0_100%]" aria-roledescription="slide" aria-label={`${index + 1} of ${banners.length}`}>
              <BannerSlide banner={banner} priority={index === 0} />
            </div>
          ))}
        </div>

        {banners.length > 1 ? (
          <>
            <button
              type="button"
              aria-label="Previous slide"
              onClick={() => {
                autoplayEnabled.current = false;
                emblaApi?.scrollPrev();
              }}
              className="absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-surface/60 text-text-primary shadow-card backdrop-blur-md transition-colors hover:bg-surface/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span aria-hidden="true">‹</span>
            </button>
            <button
              type="button"
              aria-label="Next slide"
              onClick={() => {
                autoplayEnabled.current = false;
                emblaApi?.scrollNext();
              }}
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-surface/60 text-text-primary shadow-card backdrop-blur-md transition-colors hover:bg-surface/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span aria-hidden="true">›</span>
            </button>

            <div className="absolute inset-x-0 bottom-2.5 flex justify-center gap-1.5">
              {banners.map((banner, index) => (
                <button
                  key={banner.id}
                  type="button"
                  aria-label={`Go to slide ${index + 1}`}
                  aria-current={index === selectedIndex ? "true" : undefined}
                  onClick={() => {
                    autoplayEnabled.current = false;
                    emblaApi?.scrollTo(index);
                  }}
                  className={`h-1.5 rounded-pill transition-all ${
                    index === selectedIndex ? "w-3.5 bg-surface" : "w-1.5 bg-surface/50"
                  }`}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

function BannerSlide({ banner, priority }: { banner: HomeBanner; priority: boolean }) {
  const content = (
    <div className="relative aspect-[8/5] w-full overflow-hidden bg-surface-2 sm:aspect-[21/9] sm:max-h-[280px]">
      <img
        src={banner.imageUrl}
        alt={banner.title ?? ""}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        decoding="async"
        className="h-full w-full object-cover"
      />
      {banner.title || banner.subtitle ? (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent px-4 pb-4 pt-8 text-white sm:px-6">
          {banner.title ? <p className="font-display text-base sm:text-lg">{banner.title}</p> : null}
          {banner.subtitle ? <p className="mt-0.5 font-body text-xs text-white/85 sm:text-sm">{banner.subtitle}</p> : null}
          {banner.ctaLabel && banner.ctaUrl ? (
            <span className="mt-2 inline-flex items-center rounded-pill bg-white px-3 py-1.5 font-body text-xs font-medium text-text-primary">
              {banner.ctaLabel}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  if (banner.ctaUrl && isSafeHref(banner.ctaUrl)) {
    return (
      <Link href={banner.ctaUrl} className="block" aria-label={banner.title ?? "Promotion"}>
        {content}
      </Link>
    );
  }
  return content;
}
