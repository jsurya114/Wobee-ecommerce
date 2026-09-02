"use client";

import { SectionHeader } from "@woobe/ui";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Children, useCallback, useEffect, useState, type ReactNode } from "react";

/**
 * A compact horizontal product rail (redesign spec §B/§M) on Embla
 * (ADR-022) — drag/swipe on mobile, arrow buttons on desktop. Uses the
 * canonical `SectionHeader` (compact uppercase label + optional "See all")
 * rather than a large serif heading.
 *
 * Carousel chrome only — no product data, no `ProductCard` import. The
 * server-rendered caller builds each `<ProductCard>` (already sized for the
 * track via its own wrapper div) and passes them in as `children`, so this
 * component's "use client" boundary never pulls product card markup into
 * the client bundle/hydration tree (2026-09-02 CI/perf audit fix).
 */
export function ProductRail({
  title,
  children,
  seeAllHref,
}: {
  title: string;
  children: ReactNode;
  seeAllHref?: string;
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start", dragFree: true, containScroll: "trimSnaps" });
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setCanScrollPrev(emblaApi.canScrollPrev());
    setCanScrollNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect).on("reInit", onSelect);
  }, [emblaApi, onSelect]);

  if (Children.count(children) === 0) return null;

  return (
    <section className="px-4 py-section sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          action={
            <div className="flex items-center gap-3">
              {seeAllHref ? (
                <Link href={seeAllHref} className="hover:underline">
                  See all
                </Link>
              ) : null}
              <span className="hidden gap-2 sm:flex">
                <button
                  type="button"
                  aria-label="Previous"
                  disabled={!canScrollPrev}
                  onClick={() => emblaApi?.scrollPrev()}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-text-primary transition-colors hover:bg-primary-tint disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="Next"
                  disabled={!canScrollNext}
                  onClick={() => emblaApi?.scrollNext()}
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-text-primary transition-colors hover:bg-primary-tint disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </span>
            </div>
          }
        >
          {title}
        </SectionHeader>

        <div className="overflow-hidden" ref={emblaRef}>
          <div className="-ml-2.5 flex">{children}</div>
        </div>
      </div>
    </section>
  );
}
