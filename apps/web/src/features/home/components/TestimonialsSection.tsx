import { SectionHeader } from "@woobe/ui";
import { StarRatingDisplay } from "@/features/testimonials/components/StarRating";
import { TestimonialCard } from "@/features/testimonials/components/TestimonialCard";
import type { HomeTestimonial, HomeTestimonialAggregate } from "../api/home.client";

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
 */
export function TestimonialsSection({
  testimonials,
  aggregate,
}: {
  testimonials: HomeTestimonial[];
  aggregate: HomeTestimonialAggregate | null;
}) {
  if (testimonials.length === 0) return null;

  return (
    <section className="px-4 py-section sm:px-6">
      <div className="mx-auto max-w-6xl">
        <SectionHeader>What our customers say</SectionHeader>

        {aggregate ? (
          <div className="mb-4 flex items-center gap-2.5">
            <StarRatingDisplay rating={Math.round(aggregate.averageRating)} size="md" />
            <p className="font-body text-sm text-text-primary">
              <span className="font-medium">{aggregate.averageRating.toFixed(1)} / 5</span>
              <span className="text-text-secondary"> · {aggregate.approvedCount} verified customer experience{aggregate.approvedCount === 1 ? "" : "s"}</span>
            </p>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((testimonial) => (
            <TestimonialCard key={testimonial.id} testimonial={testimonial} />
          ))}
        </div>
      </div>
    </section>
  );
}
