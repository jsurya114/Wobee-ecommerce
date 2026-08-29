import { Prisma, prisma } from "@woobe/database";
import { ConflictError, NotFoundError } from "../../../../shared/errors";
import type {
  AdminListReviewsFilter,
  AdminListReviewsResult,
  ListApprovedReviewsResult,
  ReviewRepositoryPort,
  SubmitReviewFields,
  UpdateReviewFields,
} from "../../application/ports/review-repository.port";
import type { RatingCount } from "../../domain/compute-rating-summary";
import type { ReviewEntity, ReviewStatus } from "../../domain/entities/review.entity";

const SELECT_FIELDS = {
  id: true,
  productId: true,
  userId: true,
  rating: true,
  title: true,
  body: true,
  status: true,
  isVerifiedPurchase: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * ADR-010: the ONLY file in the reviews module allowed to import
 * @woobe/database (enforced by apps/api/.dependency-cruiser.cjs).
 */
export class ReviewRepository implements ReviewRepositoryPort {
  async create(fields: SubmitReviewFields): Promise<ReviewEntity> {
    try {
      return await prisma.review.create({
        data: {
          productId: fields.productId,
          userId: fields.userId,
          rating: fields.rating,
          title: fields.title ?? null,
          body: fields.body ?? null,
          isVerifiedPurchase: fields.isVerifiedPurchase,
        },
        select: SELECT_FIELDS,
      });
    } catch (error) {
      // P2002 on (productId, userId) — the schema's own @@unique constraint
      // firing (week2 (1).md §8's "Prevent duplicate reviews"), surfaced as
      // a clean 409, never a raw 500.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError("You've already reviewed this product");
      }
      throw error;
    }
  }

  async findById(reviewId: string): Promise<ReviewEntity | null> {
    return prisma.review.findUnique({ where: { id: reviewId }, select: SELECT_FIELDS });
  }

  async findByIdForUser(userId: string, reviewId: string): Promise<ReviewEntity | null> {
    return prisma.review.findFirst({ where: { id: reviewId, userId }, select: SELECT_FIELDS });
  }

  async updateOwnReview(userId: string, reviewId: string, fields: UpdateReviewFields): Promise<ReviewEntity> {
    // updateMany, not update-by-id — the WHERE clause (id AND userId
    // together) is the authorization check, same pattern
    // AddressRepository.update already established. count===0 means either
    // the review doesn't exist or belongs to someone else — both correctly
    // surface as 404.
    const result = await prisma.review.updateMany({
      where: { id: reviewId, userId },
      data: { ...fields, status: "PENDING" }, // re-moderation on edit — see UpdateOwnReviewUseCase's own comment
    });
    if (result.count === 0) {
      throw new NotFoundError("Review not found");
    }
    const updated = await prisma.review.findUnique({ where: { id: reviewId }, select: SELECT_FIELDS });
    if (!updated) {
      throw new NotFoundError("Review not found");
    }
    return updated;
  }

  async deleteOwnReview(userId: string, reviewId: string): Promise<void> {
    const result = await prisma.review.deleteMany({ where: { id: reviewId, userId } });
    if (result.count === 0) {
      throw new NotFoundError("Review not found");
    }
  }

  async listApprovedForProduct(productId: string, page: number, pageSize: number): Promise<ListApprovedReviewsResult> {
    const where: Prisma.ReviewWhereInput = { productId, status: "APPROVED" };
    const [items, total] = await Promise.all([
      prisma.review.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: SELECT_FIELDS,
      }),
      prisma.review.count({ where }),
    ]);
    return { items, total };
  }

  async getApprovedRatingCounts(productId: string): Promise<RatingCount[]> {
    const rows = await prisma.review.groupBy({
      by: ["rating"],
      where: { productId, status: "APPROVED" },
      _count: { rating: true },
    });
    return rows.map((row) => ({ rating: row.rating, count: row._count.rating }));
  }

  async listForAdmin(filter: AdminListReviewsFilter): Promise<AdminListReviewsResult> {
    const where: Prisma.ReviewWhereInput = filter.status ? { status: filter.status } : {};
    const [items, total] = await Promise.all([
      prisma.review.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
        select: SELECT_FIELDS,
      }),
      prisma.review.count({ where }),
    ]);
    return { items, total };
  }

  async setStatus(reviewId: string, status: ReviewStatus): Promise<ReviewEntity> {
    return prisma.review.update({ where: { id: reviewId }, data: { status }, select: SELECT_FIELDS });
  }

  async listTopApproved(limit: number): Promise<ReviewEntity[]> {
    return prisma.review.findMany({
      where: { status: "APPROVED" },
      orderBy: [{ rating: "desc" }, { createdAt: "desc" }],
      take: limit,
      select: SELECT_FIELDS,
    });
  }
}
