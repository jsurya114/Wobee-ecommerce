export interface RatingCount {
  rating: number;
  count: number;
}

export interface RatingSummary {
  averageRating: number;
  reviewCount: number;
  /** Count per star, 1–5, always present even when zero — the UI can render a full breakdown bar without guarding against missing keys. */
  breakdown: Record<1 | 2 | 3 | 4 | 5, number>;
}

/**
 * Pure, dependency-free (week2 (1).md §8's "Rating summary" +
 * "Rating aggregation" test requirement) — takes the raw per-rating counts
 * a `groupBy` query already computed in the database (never loads every
 * review row into memory just to average them) and turns it into a display
 * summary. Only APPROVED reviews should ever be passed in here — enforced
 * by the repository's own query, not by this function.
 */
export function computeRatingSummary(counts: RatingCount[]): RatingSummary {
  const breakdown: RatingSummary["breakdown"] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let totalCount = 0;
  let totalScore = 0;

  for (const { rating, count } of counts) {
    if (rating >= 1 && rating <= 5) {
      breakdown[rating as 1 | 2 | 3 | 4 | 5] = count;
    }
    totalCount += count;
    totalScore += rating * count;
  }

  return {
    averageRating: totalCount === 0 ? 0 : Math.round((totalScore / totalCount) * 10) / 10,
    reviewCount: totalCount,
    breakdown,
  };
}
