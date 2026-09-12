import type { BannerSummaryEntity } from "../../../banners/domain/entities/banner.entity";
import type { CategoryEntity } from "../../../categories/domain/entities/category.entity";
import type { CollectionEntity } from "../../../collections/domain/entities/collection.entity";
import type { ListProductsResult } from "../../../products/application/use-cases/list-products.use-case";
import type { ProductSummaryWithStatus } from "../../../products/application/ports/product-repository.port";
import type { ProductSummaryEntity } from "../../../products/domain/entities/product.entity";
import type { VariantSaleQuantity } from "../../../orders/application/ports/order-repository.port";
import type { AggregateRatingView } from "../../../testimonials/application/use-cases/get-aggregate-rating.use-case";
import type { PublicTestimonialView } from "../../../testimonials/application/use-cases/list-approved-testimonials.use-case";

const NEW_ARRIVALS_LIMIT = 8;
const BEST_SELLERS_LIMIT = 8;
/**
 * Same curated clothing-size vocabulary as the PLP's own `SIZE_OPTIONS`
 * (apps/web/src/features/catalog/lib/filter-options.ts) — kept as a
 * separate literal here rather than a shared package export (a bigger,
 * riskier change for what's still a 7-item list), so if one changes the
 * other must be updated to match. Deliberately excludes the non-clothing
 * numeric size values found in the DB during the homepage audit (footwear
 * "37"/"38"/"39", jewelry "2.4"/"2.6") — see `countActiveProductsBySize`'s
 * own doc comment on why a curated list, not every distinct DB value, is
 * the correct scope for this rail.
 */
const CURATED_CLOTHING_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "One Size"];
// Multiple variants (colour/size) can belong to the same product, and a
// variant sold in the past can since have been deleted/reassigned — overfetch
// variant-level rows before collapsing to distinct, still-real products so
// the final rail still has BEST_SELLERS_LIMIT items whenever enough sales
// history exists.
const BEST_SELLERS_VARIANT_OVERFETCH = 60;
const FEATURED_COLLECTIONS_LIMIT = 4;
// 2026-08-31 (card redesign) — fixed price buckets, same values ShopByBudget
// previously hardcoded client-side; moved here so the cover image and the
// filter link stay in sync from one source instead of two.
const BUDGET_TILE_DEFS = [
  { label: "Under ₹499", maxPricePaise: 49_900 },
  { label: "Under ₹799", maxPricePaise: 79_900 },
  { label: "Under ₹999", maxPricePaise: 99_900 },
];
/** "Loved by Our Customers" rail (2026-09-11, replaces the old per-product Customer Reviews rail) — up to this many APPROVED testimonials, newest/highest-rated first. */
const TESTIMONIALS_LIMIT = 6;

/**
 * Matches `ListProductsUseCase`'s own `execute` signature — only the fields
 * this rail needs are passed (categorySlug/collectionSlug/etc. all stay
 * undefined). `inStockOnly` (merchandising logic corrections, 2026-09-06) is
 * always passed `true` by this rail — see the class doc comment's "New
 * Arrivals" bullet.
 */
interface NewArrivalsLister {
  execute(input: { sort: "newest"; page: number; limit: number; inStockOnly?: boolean }): Promise<ListProductsResult>;
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

/** Matches `ListApprovedTestimonialsUseCase`'s own `execute` signature. */
interface ApprovedTestimonialsReader {
  execute(limit: number): Promise<PublicTestimonialView[]>;
}

/** Matches `GetAggregateTestimonialRatingUseCase`'s own `execute` signature. */
interface AggregateTestimonialRatingReader {
  execute(): Promise<AggregateRatingView>;
}

/** Matches `ListCategoriesUseCase`'s own `execute` signature (redesign §B — the category rail). */
interface CategoriesLister {
  execute(): Promise<CategoryEntity[]>;
}

/** Matches `GetCategoryImagesUseCase`'s own `execute` signature (redesign O-3). */
interface CategoryImageResolver {
  execute(categoryIds: string[]): Promise<Map<string, string>>;
}

/** Matches `ListVisibleBannersUseCase`'s own `execute` signature (2026-08-31 promo carousel). */
interface VisibleBannersLister {
  execute(): Promise<BannerSummaryEntity[]>;
}

/**
 * Every product id, catalogue-wide, that currently has at least one
 * in-stock, active variant (merchandising logic corrections, 2026-09-06) —
 * composed in `home.module.ts` from `inventory`'s `findInStockVariantIds`
 * plus `products`' own variant→product resolver (the same two building
 * blocks `resolveBestSellers` already uses for the sales aggregate), not a
 * new inventory query. Backs "Loved by Customers": a product can have sold
 * well historically and still be unavailable right now (single-unit stock
 * is the norm here, see `GetHomePageUseCase`'s own doc comment), so ranking
 * alone is never enough to decide what belongs in a "shop now" rail.
 */
interface InStockProductIdsProvider {
  execute(): Promise<Set<string>>;
}

/** Matches `CountActiveProductsBySizeUseCase`'s own `execute` signature — backs the "Shop your size" rail. */
interface SizeAvailabilityReader {
  execute(sizes: string[]): Promise<Map<string, number>>;
}

/** Matches `ListProductsUseCase`'s own `execute` signature (2026-08-31 budget tile cover images) — the same concrete instance as `newArrivalsLister` satisfies both narrow interfaces. */
interface BudgetProductsLister {
  execute(input: { maxPricePaise: number; sort: "price_desc"; page: number; limit: number }): Promise<ListProductsResult>;
}

export interface HomeCategoryTile {
  id: string;
  name: string;
  slug: string;
  /** A representative product image, or null — the rail falls back to a tinted initial. */
  imageUrl: string | null;
}

export interface HomeBudgetTile {
  label: string;
  maxPricePaise: number;
  /** The cheapest active product at/under this cap's own image, or null if nothing qualifies yet. */
  imageUrl: string | null;
}

export interface HomeTestimonialView {
  id: string;
  rating: number;
  text: string;
  createdAt: Date;
  displayName: string;
  images: { id: string; url: string }[];
}

export interface HomeTestimonialAggregate {
  averageRating: number;
  approvedCount: number;
}

export interface HomeSizeOption {
  size: string;
  count: number;
}

export interface HomePageView {
  banners: BannerSummaryEntity[];
  categoryTiles: HomeCategoryTile[];
  newArrivals: ProductSummaryEntity[];
  /**
   * "Loved by Customers" on the storefront (renamed from "Best Sellers",
   * merchandising logic corrections 2026-09-06) — see `resolveBestSellers`'s
   * own doc comment for what this now represents: products with completed
   * (DELIVERED) sales, filtered to what's active and currently in stock.
   * Field name kept as `bestSellers` (not renamed) to avoid an unrelated
   * ripple through the frontend/tests for a label-only change.
   */
  bestSellers: ProductSummaryEntity[];
  featuredCollections: CollectionEntity[];
  /** "Loved by Our Customers" — APPROVED store-experience testimonials only, never product reviews (2026-09-11). */
  testimonials: HomeTestimonialView[];
  /** null when there are zero APPROVED testimonials yet — the storefront omits the aggregate display entirely rather than show a fabricated 0/5. */
  testimonialAggregate: HomeTestimonialAggregate | null;
  budgetTiles: HomeBudgetTile[];
  /** "Shop your size" rail — one entry per `CURATED_CLOTHING_SIZES` value with at least one matching live variant; a size with none is simply absent. */
  sizeAvailability: HomeSizeOption[];
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
 * - New Arrivals: `products` sorted `newest`, `inStockOnly: true` (2026-09-06
 *   merchandising fix — a single-unit-inventory catalogue means "new" and
 *   "sold out" overlap constantly; New Arrivals is meant to answer "what can
 *   I actually buy that just came in," not just "what was created recently
 *   and might still be `isActive`").
 * - "Loved by Customers" (renamed from "Best Sellers"): `orders`' completed-
 *   sale aggregate — DELIVERED orders only (not the broader CONFIRMED/
 *   PROCESSING/SHIPPED/DELIVERED set the admin dashboard's own "Best
 *   Sellers (all time)" panel still uses; see `resolveBestSellers`'s own
 *   doc comment for why), collapsed from variant-level to product-level
 *   here (the collapsing logic itself, not a trivial pass-through, which is
 *   why it's real application-layer code and not just port wiring in
 *   home.module.ts), then filtered to active AND currently in-stock.
 * - Featured Collections ("Curated Collections" on the storefront): every
 *   active `collections` row — there is no `isFeatured` flag in the schema
 *   (checked before writing this), so "featured"/"curated" here means
 *   "currently active," same honesty call CategoryTiles.tsx already made
 *   for "Shop by Vibe." (2026-09-06: the storefront label was "Featured
 *   Collections"/"New Drops" implying a recency lifecycle this data never
 *   had — see the homepage audit's finding I — so the label changed, not
 *   this resolution logic.)
 * - "Loved by Our Customers" (2026-09-11, replaces the old per-product
 *   "Customer Reviews" rail): `testimonials`' highest-rated APPROVED store-
 *   experience testimonials — server-derived "First L." identity, never a
 *   raw customer name/id, and never a product reference at all (a
 *   testimonial belongs to CUSTOMER + ORDER + the Woobe experience, not to
 *   any one inventory item, per that module's own doc comment). The
 *   aggregate rating alongside it is computed from APPROVED testimonials
 *   only and is `null` (never a fabricated number) when none exist yet.
 * - Shop your size: a live variant count per `CURATED_CLOTHING_SIZES` entry
 *   (2026-09-06) — a discovery/navigation rail, not a product grid; each
 *   entry links to the PLP's existing `?size=` filter, never a second size-
 *   filtering implementation.
 *
 * Sections with no real data source yet (Offers, Shop by Vibe, UGC/
 * Instagram, Build Your Look) are simply absent from HomePageView — not
 * built with placeholder content, per Module 12's own "do not invent" list.
 * "Fresh Picks" (2026-09-06: removed) used to be rendered here too, but it
 * was never a distinct query — the storefront page just re-sliced
 * `newArrivals` under a second label (see the homepage audit's finding C) —
 * so there was never a backend field for it to begin with; New Arrivals is
 * now the single freshness rail.
 */
export class GetHomePageUseCase {
  constructor(
    private readonly newArrivalsLister: NewArrivalsLister,
    private readonly bestSellingVariantsReader: BestSellingVariantsReader,
    private readonly variantProductResolver: VariantProductResolver,
    private readonly productsByIdsReader: ProductsByIdsReader,
    private readonly activeCollectionsLister: ActiveCollectionsLister,
    private readonly approvedTestimonialsReader: ApprovedTestimonialsReader,
    private readonly aggregateTestimonialRatingReader: AggregateTestimonialRatingReader,
    private readonly categoriesLister: CategoriesLister,
    private readonly categoryImageResolver: CategoryImageResolver,
    private readonly visibleBannersLister: VisibleBannersLister,
    private readonly budgetProductsLister: BudgetProductsLister,
    private readonly inStockProductIdsProvider: InStockProductIdsProvider,
    private readonly sizeAvailabilityReader: SizeAvailabilityReader,
  ) {}

  async execute(): Promise<HomePageView> {
    const [
      banners,
      categoryTiles,
      newArrivals,
      bestSellers,
      featuredCollections,
      testimonials,
      testimonialAggregate,
      budgetTiles,
      sizeAvailability,
    ] = await Promise.all([
      this.visibleBannersLister.execute(),
      this.resolveCategoryTiles(),
      this.newArrivalsLister
        .execute({ sort: "newest", page: 1, limit: NEW_ARRIVALS_LIMIT, inStockOnly: true })
        .then((result) => result.products),
      this.resolveBestSellers(),
      this.activeCollectionsLister.execute(),
      this.approvedTestimonialsReader.execute(TESTIMONIALS_LIMIT),
      this.resolveTestimonialAggregate(),
      this.resolveBudgetTiles(),
      this.resolveSizeAvailability(),
    ]);

    return {
      banners,
      categoryTiles,
      newArrivals,
      bestSellers,
      featuredCollections: featuredCollections.slice(0, FEATURED_COLLECTIONS_LIMIT),
      testimonials,
      testimonialAggregate,
      budgetTiles,
      sizeAvailability,
    };
  }

  private async resolveCategoryTiles(): Promise<HomeCategoryTile[]> {
    const categories = await this.categoriesLister.execute();
    if (categories.length === 0) return [];
    const imageByCategoryId = await this.categoryImageResolver.execute(categories.map((category) => category.id));
    return categories.map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      // Prefer the category's own `imageUrl` (seed/admin-set); fall back to a
      // representative product image; else null (the rail shows a tinted initial).
      imageUrl: category.imageUrl ?? imageByCategoryId.get(category.id) ?? null,
    }));
  }

  /**
   * "Loved by Customers" (2026-09-06 merchandising fix — see the class doc
   * comment). `bestSellingVariantsReader` is bound in home.module.ts to
   * DELIVERED-only sales (not the broader "sold" set the admin dashboard
   * still uses) — a CONFIRMED COD order hasn't even been paid for yet, and
   * this metric represents completed deliveries, not a net-of-returns sales
   * ledger (a delivered-then-returned item still counts here; excluding
   * that would mean joining the `Return` table, deliberately out of scope
   * for this pass — see the corrections spec's own "keep the ranking
   * simple" instruction). Ranking is computed over ALL matching sales
   * history regardless of current stock; only the FINAL candidate list is
   * filtered to active + in-stock, so a product's historical popularity
   * still determines its rank among what's actually available today.
   */
  private async resolveBestSellers(): Promise<ProductSummaryEntity[]> {
    const variantSales = await this.bestSellingVariantsReader.execute(BEST_SELLERS_VARIANT_OVERFETCH);
    if (variantSales.length === 0) return [];

    const [productIdByVariant, inStockProductIds] = await Promise.all([
      this.variantProductResolver.execute(variantSales.map((sale) => sale.variantId)),
      this.inStockProductIdsProvider.execute(),
    ]);

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

    // Preserve sales-rank order. A discontinued (inactive) product has no
    // business in a "shop now" rail — skip it rather than link to a dead
    // end. Likewise a product that sold well historically but has nothing
    // in stock right now (2026-09-06) — single-unit inventory means a
    // product's one unit selling out is the norm, not the exception, so
    // "popular" and "currently buyable" are never the same question here.
    return rankedProductIds
      .map((id) => products.get(id))
      .filter((product): product is ProductSummaryWithStatus => !!product?.isActive && inStockProductIds.has(product.id));
  }

  /** "Shop your size" rail — preserves `CURATED_CLOTHING_SIZES` order; a size with no matching live variant is simply absent (never a 0-count pill). */
  private async resolveSizeAvailability(): Promise<HomeSizeOption[]> {
    const countsBySize = await this.sizeAvailabilityReader.execute(CURATED_CLOTHING_SIZES);
    return CURATED_CLOTHING_SIZES.flatMap((size) => {
      const count = countsBySize.get(size) ?? 0;
      return count > 0 ? [{ size, count }] : [];
    });
  }

  private async resolveBudgetTiles(): Promise<HomeBudgetTile[]> {
    return Promise.all(
      BUDGET_TILE_DEFS.map(async (def) => {
        const result = await this.budgetProductsLister.execute({ maxPricePaise: def.maxPricePaise, sort: "price_desc", page: 1, limit: 1 });
        return { label: def.label, maxPricePaise: def.maxPricePaise, imageUrl: result.products[0]?.primaryImage?.url ?? null };
      }),
    );
  }

  /** null when there are zero APPROVED testimonials — never a fabricated "0.0 / 5" (2026-09-11 design's own "do not fabricate data" rule). */
  private async resolveTestimonialAggregate(): Promise<HomeTestimonialAggregate | null> {
    const { approvedCount, averageRating } = await this.aggregateTestimonialRatingReader.execute();
    if (approvedCount === 0 || averageRating === null) return null;
    return { approvedCount, averageRating };
  }
}
