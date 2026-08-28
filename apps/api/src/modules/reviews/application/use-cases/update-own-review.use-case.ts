import type { ReviewEntity } from "../../domain/entities/review.entity";
import type { ReviewRepositoryPort, UpdateReviewFields } from "../ports/review-repository.port";

/**
 * "Edit ... where approved" (week2 (1).md §8) — read as "a customer may
 * edit their own review," the narrower of the two ambiguous readings
 * ("where approved" could also mean "only while the review is in APPROVED
 * status," which would make editing a rejected/pending review impossible
 * for no clear reason). Authorization: the repository's updateOwnReview()
 * scopes by (id, userId) together, same mechanism AddressRepository/
 * WishlistRepository already established — an id belonging to another
 * account's review simply doesn't match.
 *
 * An edit resets status back to PENDING (ReviewRepository's own default on
 * update) — an already-APPROVED review that gets edited needs
 * re-moderation, otherwise a customer could get a review approved and then
 * silently rewrite it into something that was never actually reviewed.
 */
export class UpdateOwnReviewUseCase {
  constructor(private readonly reviewRepository: ReviewRepositoryPort) {}

  execute(userId: string, reviewId: string, fields: UpdateReviewFields): Promise<ReviewEntity> {
    return this.reviewRepository.updateOwnReview(userId, reviewId, fields);
  }
}
