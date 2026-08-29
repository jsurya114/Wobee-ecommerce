import Link from "next/link";
import type { HomeReview } from "../api/home.client";
import { StarRatingDisplay } from "@/features/reviews/components/StarRating";

/**
 * "Customer reviews" rail (Week 2 Day 8 Part 2, week2 (1).md §12) — real
 * APPROVED reviews only (the API never returns PENDING/REJECTED/HIDDEN
 * ones), each linking through to the reviewed product. Deliberately shows
 * no reviewer name, matching the product-page review card's own existing
 * convention (ReviewCard doesn't show one either — this app never asked
 * for/stores a reviewer display name).
 */
export function CustomerReviewsSection({ reviews }: { reviews: HomeReview[] }) {
  if (reviews.length === 0) return null;

  return (
    <section className="px-4 py-10 sm:px-6">
      <h2 className="mb-5 text-center font-display text-2xl text-text-primary">What customers are saying</h2>
      <div className="mx-auto grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {reviews.map((review) => (
          <Link
            key={review.id}
            href={`/products/${review.product.slug}`}
            className="group flex flex-col gap-3 rounded-card border border-border bg-surface p-5 transition-colors hover:border-primary"
          >
            <StarRatingDisplay rating={review.rating} />
            {review.title ? <p className="font-body text-sm font-medium text-text-primary">{review.title}</p> : null}
            {review.body ? <p className="line-clamp-3 font-body text-sm text-text-secondary">{review.body}</p> : null}
            <div className="mt-1 flex items-center gap-2">
              {review.product.image ? (
                <img src={review.product.image} alt="" loading="lazy" decoding="async" className="h-8 w-8 shrink-0 rounded-control object-cover" />
              ) : null}
              <span className="truncate font-body text-xs text-text-secondary group-hover:text-primary">{review.product.name}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
