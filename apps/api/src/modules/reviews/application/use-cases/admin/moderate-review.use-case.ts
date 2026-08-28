import { NotFoundError, ValidationError } from "../../../../../shared/errors";
import type { ReviewEntity, ReviewStatus } from "../../../domain/entities/review.entity";
import type { ReviewRepositoryPort } from "../../ports/review-repository.port";

const MODERATION_TARGETS: ReadonlySet<ReviewStatus> = new Set(["APPROVED", "REJECTED", "HIDDEN"]);

/**
 * week2 (1).md §8's "Approve/reject/hide" — one use-case for all three
 * transitions rather than three separate ones (ADR-025's precedent for
 * orders' ship/deliver/etc. splits use-cases per transition because each
 * one has distinct side effects — tracking number, timestamps; a review
 * moderation decision has none, it's a plain status flip either way, so
 * one parameterized use-case is the simpler, equally clear choice here).
 * PENDING is deliberately not an allowed target — moderation only ever
 * moves a review OUT of PENDING, never back into it (that only happens
 * automatically when the author edits it — see UpdateOwnReviewUseCase).
 */
export class ModerateReviewUseCase {
  constructor(private readonly reviewRepository: ReviewRepositoryPort) {}

  async execute(reviewId: string, status: ReviewStatus): Promise<ReviewEntity> {
    if (!MODERATION_TARGETS.has(status)) {
      throw new ValidationError("status must be one of APPROVED, REJECTED, HIDDEN");
    }
    const existing = await this.reviewRepository.findById(reviewId);
    if (!existing) {
      throw new NotFoundError("Review not found");
    }
    return this.reviewRepository.setStatus(reviewId, status);
  }
}
