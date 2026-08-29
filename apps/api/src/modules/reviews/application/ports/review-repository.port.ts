import type { RatingCount } from "../../domain/compute-rating-summary";
import type { ReviewEntity, ReviewStatus } from "../../domain/entities/review.entity";

export interface SubmitReviewFields {
  productId: string;
  userId: string;
  rating: number;
  title?: string;
  body?: string;
  isVerifiedPurchase: boolean;
}

export interface UpdateReviewFields {
  rating?: number;
  title?: string;
  body?: string;
}

export interface ListApprovedReviewsResult {
  items: ReviewEntity[];
  total: number;
}

export interface AdminListReviewsFilter {
  status?: ReviewStatus;
  page: number;
  pageSize: number;
}

export interface AdminListReviewsResult {
  items: ReviewEntity[];
  total: number;
}

/**
 * application depends on this interface, not on Prisma directly
 * (ARCHITECTURE.md §3.1).
 */
export interface ReviewRepositoryPort {
  create(fields: SubmitReviewFields): Promise<ReviewEntity>;
  findById(reviewId: string): Promise<ReviewEntity | null>;
  /** Scoped by (id, userId) together — the authorization mechanism for edit/delete, same pattern AddressRepository/WishlistRepository already established. */
  findByIdForUser(userId: string, reviewId: string): Promise<ReviewEntity | null>;
  /** Editing resets status to PENDING for re-moderation — see UpdateOwnReviewUseCase's own doc comment. */
  updateOwnReview(userId: string, reviewId: string, fields: UpdateReviewFields): Promise<ReviewEntity>;
  deleteOwnReview(userId: string, reviewId: string): Promise<void>;
  /** Newest first, APPROVED only — the public product-page view. */
  listApprovedForProduct(productId: string, page: number, pageSize: number): Promise<ListApprovedReviewsResult>;
  /** Raw per-rating counts for APPROVED reviews only — feeds `computeRatingSummary`, never loads every review row just to average them. */
  getApprovedRatingCounts(productId: string): Promise<RatingCount[]>;
  /** Admin moderation queue (week2 (1).md §8) — no ownership/status filter beyond the caller's own optional status param. */
  listForAdmin(filter: AdminListReviewsFilter): Promise<AdminListReviewsResult>;
  /** The one path that ever changes status outside of an author's own edit — RBAC-gated one layer up, not here. */
  setStatus(reviewId: string, status: ReviewStatus): Promise<ReviewEntity>;
  /** Week 2 Day 8 Part 2 (week2 (1).md §12's "Customer Reviews" homepage section) — site-wide, APPROVED only, highest rating first (ties broken by newest) so the homepage leads with genuine praise rather than an arbitrary/recency-only sample. */
  listTopApproved(limit: number): Promise<ReviewEntity[]>;
}
