import type { ReviewEntity } from "../../domain/entities/review.entity";
import type { ReviewRepositoryPort } from "../ports/review-repository.port";

/**
 * Exported from reviews.module.ts for cross-module use (Week 2 Day 8 Part
 * 2, week2 (1).md §12) — `home`'s Customer Reviews rail. Deliberately thin,
 * same posture as GetProductsByIdsUseCase: the repository already does the
 * real query, this only exists so `home` depends on a use-case, not the
 * repository interface, matching every other module's own cross-module
 * export.
 */
export class ListTopApprovedReviewsUseCase {
  constructor(private readonly reviewRepository: ReviewRepositoryPort) {}

  execute(limit: number): Promise<ReviewEntity[]> {
    return this.reviewRepository.listTopApproved(limit);
  }
}
