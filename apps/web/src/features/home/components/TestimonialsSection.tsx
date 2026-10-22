"use client";

import { SectionHeader } from "@woobe/ui";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { StarRatingDisplay } from "@/features/testimonials/components/StarRating";
import { TestimonialCard } from "@/features/testimonials/components/TestimonialCard";
import type { HomeTestimonial, HomeTestimonialAggregate } from "../api/home.client";

/** Time each testimonial stays put before the carousel advances on its own. */
const AUTOPLAY_INTERVAL_MS = 5000;

/**
 * "What Our Customers Say" (2026-09-11, replaces the old per-product
 * "Customer Reviews" rail) — a STORE-experience testimonial section, not
 * product reviews: Woobe's surplus/limited-run stock means a given product
 * may never restock, so feedback belongs to CUSTOMER + ORDER + the Woobe
 * experience, never to one inventory item. Only APPROVED testimonials ever
 * reach this component — enforced server-side (`home`'s own
 * GetHomePageUseCase), never fetched-then-filtered here.
 *
 * The aggregate (stars + "4.8 / 5" + "N verified customer experiences") is
 * `null` whenever there are zero approved testimonials — omitted entirely
 * rather than showing a fabricated "0.0 / 5" (2026-09-11 design's own "do
 * not fabricate data" rule).
 *
 * Presentation (2026-09-21): a swipeable Embla carousel by default (same
 * library + arrow-button chrome as `ProductRail`, ADR-022) showing 1 / 2 / 3
 * cards per view at the same breakpoints the old grid used; "Show all"
 * swaps it for that full grid, "Show less" swaps back. Cards are unchanged.
 *
 * Auto-advances every `AUTOPLAY_INTERVAL_MS` (plain `setInterval`, same as
 * `PromoCarousel` — no plugin), wrapping back to the first card after the
 * last. Pauses while the visitor hovers, focuses or touches/drags it, and
 * resumes when they let go; skipped entirely under `prefers-reduced-motion:
 * reduce`, and when every card already fits (nothing to advance to).
 */
export function TestimonialsSection({
  testimonials,
  aggregate,
}: {
  testimonials: HomeTestimonial[];
  aggregate: HomeTestimonialAggregate | null;
}) {
  // `testimonials` is typed as always-an-array, but the actual value comes
  // straight from a `GET /api/v1/home` response that can be served out of
  // the API's own 60s home-page cache (home.module.ts's `cacheAside`) — a
  // cache entry written by pre-this-field API code parses fine as JSON and
  // is missing the key entirely, so the type alone can't be trusted here.
  // Fall back to empty rather than crash on `.length` of `undefined`; the
  // real fix is home.module.ts's cache-key schema version (bumped whenever
  // HomePageView's shape changes), this is the last line of defense for
  // whatever staleness window still exists around a deploy.
  const items = testimonials ?? [];
  const [showAll, setShowAll] = useState(false);
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start", containScroll: "trimSnaps" });
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const paused = useRef(false);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setCanScrollPrev(emblaApi.canScrollPrev());
    setCanScrollNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect).on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect).off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  // Touch has no hover/leave, so a drag pauses on pointer-down and resumes on release.
  useEffect(() => {
    if (!emblaApi) return;
    const pause = () => {
      paused.current = true;
    };
    const resume = () => {
      paused.current = false;
    };
    emblaApi.on("pointerDown", pause).on("pointerUp", resume);
    return () => {
      emblaApi.off("pointerDown", pause).off("pointerUp", resume);
    };
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi || showAll) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const id = window.setInterval(() => {
      if (paused.current || document.hidden) return;
      if (emblaApi.canScrollNext()) emblaApi.scrollNext();
      else if (emblaApi.canScrollPrev()) emblaApi.scrollTo(0);
    }, AUTOPLAY_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [emblaApi, showAll]);

  if (items.length === 0) return null;

  return (
    <section className="px-4 py-section sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          action={
            <div className="flex items-center gap-3">
              {items.length > 1 ? (
                <button type="button" aria-expanded={showAll} onClick={() => setShowAll((value) => !value)} className="hover:underline">
                  {showAll ? "Show less" : "Show all"}
                </button>
              ) : null}
              {showAll ? null : (
                <span className="hidden gap-2 sm:flex">
                  <button
                    type="button"
                    aria-label="Previous testimonials"
                    disabled={!canScrollPrev}
                    onClick={() => emblaApi?.scrollPrev()}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-text-primary transition-colors hover:bg-primary-tint disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next testimonials"
                    disabled={!canScrollNext}
                    onClick={() => emblaApi?.scrollNext()}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-text-primary transition-colors hover:bg-primary-tint disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </span>
              )}
            </div>
          }
        >
          What our customers say
        </SectionHeader>

        {aggregate ? (
          <div className="mb-4 flex items-center gap-2.5">
            <StarRatingDisplay rating={Math.round(aggregate.averageRating)} size="md" />
            <p className="font-body text-sm text-text-primary">
              <span className="font-medium">{aggregate.averageRating.toFixed(1)} / 5</span>
              <span className="text-text-secondary"> · {aggregate.approvedCount} verified customer experience{aggregate.approvedCount === 1 ? "" : "s"}</span>
            </p>
          </div>
        ) : null}

        {showAll ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((testimonial) => (
              <TestimonialCard key={testimonial.id} testimonial={testimonial} />
            ))}
          </div>
        ) : (
          <div
            className="overflow-hidden"
            ref={emblaRef}
            onMouseEnter={() => {
              paused.current = true;
            }}
            onMouseLeave={() => {
              paused.current = false;
            }}
            onFocus={() => {
              paused.current = true;
            }}
            onBlur={() => {
              paused.current = false;
            }}
          >
            <div className="-ml-3 flex">
              {items.map((testimonial) => (
                <div key={testimonial.id} className="flex min-w-0 shrink-0 basis-full pl-3 sm:basis-1/2 lg:basis-1/3">
                  <div className="flex w-full flex-col [&>*]:flex-1">
                    <TestimonialCard testimonial={testimonial} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
