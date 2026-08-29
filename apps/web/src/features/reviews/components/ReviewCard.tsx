import { Badge } from "@woobe/ui";
import type { Review } from "../api/reviews.client";
import { StarRatingDisplay } from "./StarRating";

export function ReviewCard({ review }: { review: Review }) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-border py-5 last:border-b-0">
      <div className="flex items-center gap-2">
        <StarRatingDisplay rating={review.rating} />
        {review.isVerifiedPurchase ? <Badge variant="success">Verified Purchase</Badge> : null}
      </div>
      {review.title ? <p className="font-body text-sm font-medium text-text-primary">{review.title}</p> : null}
      {review.body ? <p className="font-body text-sm text-text-secondary">{review.body}</p> : null}
      <p className="font-body text-xs text-text-secondary">{new Date(review.createdAt).toLocaleDateString()}</p>
    </div>
  );
}
