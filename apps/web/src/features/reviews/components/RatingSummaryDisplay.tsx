import type { RatingSummary } from "../api/reviews.client";
import { StarRatingDisplay } from "./StarRating";

export function RatingSummaryDisplay({ summary }: { summary: RatingSummary }) {
  if (summary.reviewCount === 0) {
    return <p className="font-body text-sm text-text-secondary">No reviews yet — be the first to write one.</p>;
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex items-center gap-3">
        <span className="font-display text-3xl text-text-primary">{summary.averageRating.toFixed(1)}</span>
        <div className="flex flex-col gap-0.5">
          <StarRatingDisplay rating={Math.round(summary.averageRating)} size="md" />
          <span className="font-body text-xs text-text-secondary">
            {summary.reviewCount} review{summary.reviewCount === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {([5, 4, 3, 2, 1] as const).map((star) => {
          const count = summary.breakdown[star];
          const pct = summary.reviewCount === 0 ? 0 : Math.round((count / summary.reviewCount) * 100);
          return (
            <div key={star} className="flex items-center gap-2 font-body text-xs text-text-secondary">
              <span className="w-3 text-right">{star}</span>
              <div className="h-1.5 w-28 overflow-hidden rounded-pill bg-primary-tint">
                <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-6">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
