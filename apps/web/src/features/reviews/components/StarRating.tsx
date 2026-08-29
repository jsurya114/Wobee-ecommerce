"use client";

import { Star } from "lucide-react";

/** Read-only star display — review cards and the rating summary. */
export function StarRatingDisplay({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
  const dimension = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  return (
    <div className="flex items-center gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`${dimension} ${star <= rating ? "fill-primary text-primary" : "text-border"}`}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

/** Interactive star picker for the review form. */
export function StarRatingInput({ value, onChange }: { value: number; onChange: (rating: number) => void }) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} star${star === 1 ? "" : "s"}`}
          onClick={() => onChange(star)}
          className="rounded-control p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Star className={`h-7 w-7 ${star <= value ? "fill-primary text-primary" : "text-border"}`} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
