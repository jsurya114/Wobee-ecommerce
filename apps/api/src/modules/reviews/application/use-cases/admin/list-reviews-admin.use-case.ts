import type { AdminListReviewsFilter, AdminListReviewsResult, ReviewRepositoryPort } from "../../ports/review-repository.port";

/** week2 (1).md §8's admin "View" bullet — no status filter returns every review regardless of moderation state, unlike the public listing which is always APPROVED-only. */
export class ListReviewsAdminUseCase {
  constructor(private readonly reviewRepository: ReviewRepositoryPort) {}

  execute(filter: AdminListReviewsFilter): Promise<AdminListReviewsResult> {
    return this.reviewRepository.listForAdmin(filter);
  }
}
