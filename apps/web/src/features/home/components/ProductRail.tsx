"use client";

import { SectionHeader } from "@woobe/ui";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ProductCard } from "@/features/catalog/components/ProductCard";
import type { ProductSummary } from "@/features/catalog/api/products.client";

/**
 * A compact horizontal product rail (redesign spec §B/§M) on Embla
 * (ADR-022) — drag/swipe on mobile, arrow buttons on desktop. Uses the
 * canonical `SectionHeader` (compact uppercase label + optional "See all")
 * rather than a large serif heading.
 */
export function ProductRail({
  title,
  products,
  seeAllHref,
}: {
  title: string;
  products: ProductSummary[];
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

  if (products.length === 0) return null;

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
          <div className="-ml-2.5 flex">
            {products.map((product) => (
              <div key={product.id} className="min-w-0 flex-[0_0_31%] pl-2.5 sm:flex-[0_0_24%] lg:flex-[0_0_18%]">
                <ProductCard product={product} showQuickAdd />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
