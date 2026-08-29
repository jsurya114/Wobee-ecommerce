"use client";

import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ProductCard } from "@/features/catalog/components/ProductCard";
import type { ProductSummary } from "@/features/catalog/api/products.client";

/**
 * A curated-looking product rail (woobe_ui_design_plan.md §8, "New Drops")
 * built on Embla (ADR-022) — drag/swipe on mobile, arrow buttons on desktop
 * where hover/click is the primary input, not touch.
 */
export function ProductRail({ title, products }: { title: string; products: ProductSummary[] }) {
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
    <section className="px-4 py-10 sm:px-6">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <h2 className="font-display text-2xl text-text-primary">{title}</h2>
        <div className="hidden gap-2 sm:flex">
          <button
            type="button"
            aria-label="Previous"
            disabled={!canScrollPrev}
            onClick={() => emblaApi?.scrollPrev()}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-text-primary transition-colors hover:bg-primary-tint disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Next"
            disabled={!canScrollNext}
            onClick={() => emblaApi?.scrollNext()}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-text-primary transition-colors hover:bg-primary-tint disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="mx-auto mt-5 max-w-6xl overflow-hidden" ref={emblaRef}>
        <div className="-ml-4 flex">
          {products.map((product) => (
            <div key={product.id} className="min-w-0 flex-[0_0_45%] pl-4 sm:flex-[0_0_28%] lg:flex-[0_0_22%]">
              <ProductCard product={product} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
