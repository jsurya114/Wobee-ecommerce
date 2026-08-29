import { NotFoundError } from "../../../../shared/errors";
import type { ReviewEntity } from "../../domain/entities/review.entity";
import type { ProductCatalogPort } from "../ports/product-catalog.port";
import type { PurchaseCheckerPort } from "../ports/purchase-checker.port";
import type { ReviewRepositoryPort } from "../ports/review-repository.port";

export interface SubmitReviewCommand {
  userId: string;
  productId: string;
  rating: number;
  title?: string;
  body?: string;
}

/**
 * Deliberate scope call (week2 (1).md §8), flagged prominently — no
 * approved requirement anywhere in this codebase mandates "must have
 * purchased to review" (contrast with the separate "Verified-purchase
 * indicator" bullet, which this DOES implement, computed live at
 * submission time via `PurchaseCheckerPort`). Gating submission on
 * purchase isn't in `plan.md`/`architecture.md`, and §1's "do not invent
 * business rules" cuts against adding one unasked — so any authenticated
 * customer may submit a review; the badge distinguishes a purchased
 * reviewer from one who didn't buy, the same way many real storefronts
 * (not just marketplaces with a hard purchase gate) handle it.
 *
 * Duplicate prevention (§8's own rule) rides the schema's
 * `@@unique([productId, userId])` constraint, not reinvented here — see
 * ReviewRepository.create's own comment for the P2002 mapping.
 *
 * New reviews start PENDING (ReviewRepository's own default) — nothing is
 * publicly visible or counted in the rating summary until an admin
 * approves it, which is what makes the plan's "Moderation" requirement and
 * test bullet meaningful rather than vacuous.
 */
export class SubmitReviewUseCase {
  constructor(
    private readonly reviewRepository: ReviewRepositoryPort,
    private readonly productCatalog: ProductCatalogPort,
    private readonly purchaseChecker: PurchaseCheckerPort,
  ) {}

  async execute(command: SubmitReviewCommand): Promise<ReviewEntity> {
    const products = await this.productCatalog.getProducts([command.productId]);
    const product = products.get(command.productId);
    if (!product) {
      throw new NotFoundError("Product not found");
    }

    const isVerifiedPurchase = await this.purchaseChecker.hasPurchased(command.userId, command.productId);

    // Duplicate-review conflicts surface as a clean ConflictError straight
    // from the repository (schema's own @@unique constraint) — nothing to
    // catch here.
    return this.reviewRepository.create({
      productId: command.productId,
      userId: command.userId,
      rating: command.rating,
      title: command.title,
      body: command.body,
      isVerifiedPurchase,
    });
  }
}
