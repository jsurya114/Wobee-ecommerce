import type { CollectionEntity } from "../../../collections/domain/entities/collection.entity";
import type { ListProductsResult } from "../../../products/application/use-cases/list-products.use-case";
import type { ProductSummaryWithStatus } from "../../../products/application/ports/product-repository.port";
import type { ProductSummaryEntity } from "../../../products/domain/entities/product.entity";
import type { VariantSaleQuantity } from "../../../orders/application/ports/order-repository.port";
import type { ReviewEntity } from "../../../reviews/domain/entities/review.entity";

const NEW_ARRIVALS_LIMIT = 8;
const BEST_SELLERS_LIMIT = 8;
// Multiple variants (colour/size) can belong to the same product, and a
// variant sold in the past can since have been deleted/reassigned — overfetch
// variant-level rows before collapsing to distinct, still-real products so
// the final rail still has BEST_SELLERS_LIMIT items whenever enough sales
// history exists.
const BEST_SELLERS_VARIANT_OVERFETCH = 60;
const FEATURED_COLLECTIONS_LIMIT = 4;
const CUSTOMER_REVIEWS_LIMIT = 6;
// Same reasoning as best sellers: a review's product can since have gone
// inactive, so overfetch reviews before filtering down to CUSTOMER_REVIEWS_LIMIT.
const CUSTOMER_REVIEWS_OVERFETCH = CUSTOMER_REVIEWS_LIMIT * 3;

/** Matches `ListProductsUseCase`'s own `execute` signature — only the 3 fields this rail needs are passed (categorySlug/collectionSlug/etc. all stay undefined). */
interface NewArrivalsLister {
  execute(input: { sort: "newest"; page: number; limit: number }): Promise<ListProductsResult>;
}

/** Matches `GetBestSellingVariantQuantitiesUseCase`'s own `execute` signature. */
interface BestSellingVariantsReader {
  execute(limit: number): Promise<VariantSaleQuantity[]>;
}

/** Matches `ResolveProductIdsForVariantsUseCase`'s own `execute` signature. */
interface VariantProductResolver {
  execute(variantIds: string[]): Promise<Map<string, string>>;
}

/** Matches `GetProductsByIdsUseCase`'s own `execute` signature — shared by the Best Sellers and Customer Reviews sections. */
interface ProductsByIdsReader {
  execute(productIds: string[]): Promise<Map<string, ProductSummaryWithStatus>>;
}

/** Matches `ListCollectionsUseCase`'s own `execute` signature. */
interface ActiveCollectionsLister {
  execute(): Promise<CollectionEntity[]>;
}

/** Matches `ListTopApprovedReviewsUseCase`'s own `execute` signature. */
interface TopApprovedReviewsReader {
  execute(limit: number): Promise<ReviewEntity[]>;
}

export interface HomeReviewView {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  createdAt: Date;
  product: { id: string; slug: string; name: string; image: string | null };
}

export interface HomePageView {
  newArrivals: ProductSummaryEntity[];
  bestSellers: ProductSummaryEntity[];
  featuredCollections: CollectionEntity[];
  customerReviews: HomeReviewView[];
}

/**
 * Week 2 Day 8 Part 2 (week2 (1).md §12 — Homepage Expansion), composed
 * here in a new top-level `home` module rather than inside any one of
 * `products`/`orders`/`collections`/`reviews`: this view genuinely spans all
 * four, the same "compose above the modules that would otherwise cycle"
 * reasoning `admin`'s own GetCustomerDetailUseCase/CancelOrderWithRefundUseCase
 * already establish (see their doc comments) — `home` sits above all four
 * and, like `admin`, is imported by nothing. The constructor depends on the
 * narrow `execute`-shaped interfaces above, not the concrete use-case
 * classes, matching that same file's DIP posture.
 *
 * Every section reads only real, already-approved data:
 * - New Arrivals: `products` sorted `newest`.
 * - Best Sellers: `orders`' real sales aggregate (units sold across every
 *   order in a genuine-purchase status — see VariantSaleQuantity's own doc
 *   comment), collapsed from variant-level to product-level here (the
 *   collapsing logic itself, not a trivial pass-through, which is why it's
 *   real application-layer code and not just port wiring in home.module.ts).
 * - Featured Collections: every active `collections` row — there is no
 *   `isFeatured` flag in the schema (checked before writing this), so
 *   "featured" here means "currently active," same honesty call
 *   CategoryTiles.tsx already made for "Shop by Vibe."
 * - Customer Reviews: `reviews`' highest-rated APPROVED reviews, enriched
 *   with just the reviewed product's name/slug/image — never a reviewer
 *   name, matching the product-page review card's own existing convention.
 *
 * Sections with no real data source yet (Offers, Shop by Vibe, UGC/
 * Instagram, Build Your Look) are simply absent from HomePageView — not
 * built with placeholder content, per Module 12's own "do not invent" list.
 */
export class GetHomePageUseCase {
  constructor(
    private readonly newArrivalsLister: NewArrivalsLister,
    private readonly bestSellingVariantsReader: BestSellingVariantsReader,
    private readonly variantProductResolver: VariantProductResolver,
    private readonly productsByIdsReader: ProductsByIdsReader,
    private readonly activeCollectionsLister: ActiveCollectionsLister,
    private readonly topApprovedReviewsReader: TopApprovedReviewsReader,
  ) {}

  async execute(): Promise<HomePageView> {
    const [newArrivals, bestSellers, featuredCollections, customerReviews] = await Promise.all([
      this.newArrivalsLister.execute({ sort: "newest", page: 1, limit: NEW_ARRIVALS_LIMIT }).then((result) => result.products),
      this.resolveBestSellers(),
      this.activeCollectionsLister.execute(),
      this.resolveCustomerReviews(),
    ]);

    return {
      newArrivals,
      bestSellers,
      featuredCollections: featuredCollections.slice(0, FEATURED_COLLECTIONS_LIMIT),
      customerReviews,
    };
  }

  private async resolveBestSellers(): Promise<ProductSummaryEntity[]> {
    const variantSales = await this.bestSellingVariantsReader.execute(BEST_SELLERS_VARIANT_OVERFETCH);
    if (variantSales.length === 0) return [];

    const productIdByVariant = await this.variantProductResolver.execute(variantSales.map((sale) => sale.variantId));

    // Collapse variant-level sales to product-level, preserving total units
    // sold as the ranking signal (a product with 3 colourways selling 5
    // units each outranks one selling 10 units in a single colourway).
    const quantityByProductId = new Map<string, number>();
    for (const sale of variantSales) {
      const productId = productIdByVariant.get(sale.variantId);
      if (!productId) continue; // Variant since deleted/reassigned — skip, don't fail the whole rail.
      quantityByProductId.set(productId, (quantityByProductId.get(productId) ?? 0) + sale.quantitySold);
    }

    const rankedProductIds = Array.from(quantityByProductId.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, BEST_SELLERS_LIMIT)
      .map(([productId]) => productId);

    const products = await this.productsByIdsReader.execute(rankedProductIds);

    // Preserve sales-rank order; a discontinued (inactive) product has no
    // business in a "shop now" rail — skip it rather than link to a dead end.
    return rankedProductIds.map((id) => products.get(id)).filter((product): product is ProductSummaryWithStatus => !!product?.isActive);
  }

  private async resolveCustomerReviews(): Promise<HomeReviewView[]> {
    const reviews = await this.topApprovedReviewsReader.execute(CUSTOMER_REVIEWS_OVERFETCH);
    if (reviews.length === 0) return [];

    const productIds = Array.from(new Set(reviews.map((review) => review.productId)));
    const products = await this.productsByIdsReader.execute(productIds);

    const result: HomeReviewView[] = [];
    for (const review of reviews) {
      const product = products.get(review.productId);
      if (!product?.isActive) continue; // Same "no dead-end links" rule as best sellers.
      result.push({
        id: review.id,
        rating: review.rating,
        title: review.title,
        body: review.body,
        createdAt: review.createdAt,
        product: { id: product.id, slug: product.slug, name: product.name, image: product.primaryImage?.url ?? null },
      });
      if (result.length === CUSTOMER_REVIEWS_LIMIT) break;
    }
    return result;
  }
}
