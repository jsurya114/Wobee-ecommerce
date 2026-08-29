// Composition root for the reviews module (ARCHITECTURE.md §3.2) — wires
// its own repo to its own use-cases to routes, and wires this module's
// ports to other modules' exported use-cases (products, orders) as trivial
// pass-through adapters, the same shape wishlist.module.ts already uses.
// Owns (ADR-010): Review.
//
// Week 2 Day 4 (week2 (1).md §8) build-out of the Week 1 placeholder — was
// a bare `Router()`, no routes.
import { hasPurchasedProductUseCase } from "../orders/orders.module";
import { getProductsByIdsUseCase } from "../products/products.module";
import type { ProductCatalogPort, ReviewProductDetail } from "./application/ports/product-catalog.port";
import type { PurchaseCheckerPort } from "./application/ports/purchase-checker.port";
import { ListReviewsAdminUseCase } from "./application/use-cases/admin/list-reviews-admin.use-case";
import { ModerateReviewUseCase } from "./application/use-cases/admin/moderate-review.use-case";
import { DeleteOwnReviewUseCase } from "./application/use-cases/delete-own-review.use-case";
import { ListReviewsForProductUseCase } from "./application/use-cases/list-reviews-for-product.use-case";
import { ListTopApprovedReviewsUseCase } from "./application/use-cases/list-top-approved-reviews.use-case";
import { SubmitReviewUseCase } from "./application/use-cases/submit-review.use-case";
import { UpdateOwnReviewUseCase } from "./application/use-cases/update-own-review.use-case";
import { ReviewRepository } from "./infrastructure/repositories/review.repository";
import { ReviewsController } from "./interface/http/reviews.controller";
import { createReviewsRouter } from "./interface/http/reviews.routes";

const reviewRepository = new ReviewRepository();

const productCatalog: ProductCatalogPort = {
  getProducts: async (productIds) => {
    const details = await getProductsByIdsUseCase.execute(productIds);
    const mapped = new Map<string, ReviewProductDetail>();
    for (const [id, detail] of details) {
      mapped.set(id, { id: detail.id, slug: detail.slug, name: detail.name, isActive: detail.isActive });
    }
    return mapped;
  },
};

const purchaseChecker: PurchaseCheckerPort = {
  hasPurchased: (userId, productId) => hasPurchasedProductUseCase.execute(userId, productId),
};

const listReviewsForProductUseCase = new ListReviewsForProductUseCase(reviewRepository);
const submitReviewUseCase = new SubmitReviewUseCase(reviewRepository, productCatalog, purchaseChecker);
const updateOwnReviewUseCase = new UpdateOwnReviewUseCase(reviewRepository);
const deleteOwnReviewUseCase = new DeleteOwnReviewUseCase(reviewRepository);

/** Exported for the `admin` module's HTTP gateway (ADR-025), same pattern as collections' admin use-case exports. */
export const listReviewsAdminUseCase = new ListReviewsAdminUseCase(reviewRepository);
export const moderateReviewUseCase = new ModerateReviewUseCase(reviewRepository);
/** Exported for `home`'s Customer Reviews rail (Week 2 Day 8 Part 2). */
export const listTopApprovedReviewsUseCase = new ListTopApprovedReviewsUseCase(reviewRepository);

const reviewsController = new ReviewsController(
  listReviewsForProductUseCase,
  submitReviewUseCase,
  updateOwnReviewUseCase,
  deleteOwnReviewUseCase,
);

export const router = createReviewsRouter(reviewsController);
