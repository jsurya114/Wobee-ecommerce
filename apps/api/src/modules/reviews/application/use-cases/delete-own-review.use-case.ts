import type { ReviewRepositoryPort } from "../ports/review-repository.port";

/** Authorization: repository scopes by (id, userId) together — see UpdateOwnReviewUseCase's own doc comment. */
export class DeleteOwnReviewUseCase {
  constructor(private readonly reviewRepository: ReviewRepositoryPort) {}

  execute(userId: string, reviewId: string): Promise<void> {
    return this.reviewRepository.deleteOwnReview(userId, reviewId);
  }
}
