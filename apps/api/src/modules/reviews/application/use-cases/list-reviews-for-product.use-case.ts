import { computeRatingSummary, type RatingSummary } from "../../domain/compute-rating-summary";
import type { ReviewEntity } from "../../domain/entities/review.entity";
import type { ReviewRepositoryPort } from "../ports/review-repository.port";

export interface ListReviewsForProductResult {
  items: ReviewEntity[];
  total: number;
  page: number;
  pageSize: number;
  ratingSummary: RatingSummary;
}

/** Public product-page view (week2 (1).md §8: "View reviews", "Rating summary") — APPROVED reviews only, both for the list and for what feeds the rating average. */
export class ListReviewsForProductUseCase {
  constructor(private readonly reviewRepository: ReviewRepositoryPort) {}

  async execute(productId: string, page: number, pageSize: number): Promise<ListReviewsForProductResult> {
    const [{ items, total }, ratingCounts] = await Promise.all([
      this.reviewRepository.listApprovedForProduct(productId, page, pageSize),
      this.reviewRepository.getApprovedRatingCounts(productId),
    ]);

    return { items, total, page, pageSize, ratingSummary: computeRatingSummary(ratingCounts) };
  }
}
