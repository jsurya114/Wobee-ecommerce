// Composition root for the `home` module (ARCHITECTURE.md §3.2) — a
// top-level, permission-free HTTP gateway composing four already-built
// modules for the storefront homepage (Week 2 Day 8 Part 2, week2 (1).md
// §12). Same posture as `admin`: no domain/ or infrastructure/ layer of its
// own (owns no Prisma model), sits above every module it reads from, and is
// imported by nothing — see GetHomePageUseCase's own doc comment for why
// this can't be composed inside any single one of the four instead.
import { listVisibleBannersUseCase } from "../banners/banners.module";
import { listCategoriesUseCase } from "../categories/categories.module";
import { listCollectionsUseCase } from "../collections/collections.module";
import { findInStockVariantIdsUseCase } from "../inventory/inventory.module";
import { getBestSellingVariantQuantitiesUseCase } from "../orders/orders.module";
import {
  countActiveProductsBySizeUseCase,
  getCategoryImagesUseCase,
  getProductsByIdsUseCase,
  listProductsUseCase,
  resolveProductIdsForVariantsUseCase,
} from "../products/products.module";
import { getAggregateTestimonialRatingUseCase, listApprovedTestimonialsUseCase } from "../testimonials/testimonials.module";
import { cacheAside } from "../../shared/cache/catalog-cache";
import { env } from "../../config/env";
import { GetHomePageUseCase, type HomePageView } from "./application/use-cases/get-homepage.use-case";
import { HomeController } from "./interface/http/home.controller";
import { createHomeRouter } from "./interface/http/home.routes";

/**
 * "Loved by Customers" now reads a stricter "sold" definition than the
 * admin dashboard's own Best Sellers panel (merchandising logic
 * corrections, 2026-09-06) — DELIVERED only, see
 * `findBestSellingVariantQuantities`'s own doc comment. Bound here, not in
 * GetHomePageUseCase itself, so that use-case's own `BestSellingVariantsReader`
 * interface stays unchanged and admin's own caller (unchanged, still
 * `getBestSellingVariantQuantitiesUseCase.execute(limit)`) is unaffected.
 */
const deliveredOnlyBestSellingVariantsReader = {
  execute: (limit: number) => getBestSellingVariantQuantitiesUseCase.execute(limit, ["DELIVERED"]),
};

/**
 * Every product id with at least one currently in-stock, active variant —
 * composed from the same two building blocks `resolveBestSellers` already
 * uses for the sales aggregate (`inventory`'s in-stock variant ids,
 * `products`' variant→product resolver), not a new inventory query.
 */
const inStockProductIdsProvider = {
  execute: async (): Promise<Set<string>> => {
    const inStockVariantIds = await findInStockVariantIdsUseCase.execute();
    const productIdByVariant = await resolveProductIdsForVariantsUseCase.execute(inStockVariantIds);
    return new Set(productIdByVariant.values());
  },
};

const realGetHomePageUseCase = new GetHomePageUseCase(
  listProductsUseCase,
  deliveredOnlyBestSellingVariantsReader,
  resolveProductIdsForVariantsUseCase,
  getProductsByIdsUseCase,
  listCollectionsUseCase,
  listApprovedTestimonialsUseCase,
  getAggregateTestimonialRatingUseCase,
  listCategoriesUseCase,
  getCategoryImagesUseCase,
  listVisibleBannersUseCase,
  listProductsUseCase,
  inStockProductIdsProvider,
  countActiveProductsBySizeUseCase,
);

const HOME_TTL_SECONDS = 60;

/**
 * Bump this whenever `HomePageView`'s shape changes (a field added,
 * removed, or renamed) and fold it into the cache key below. Without it, a
 * Redis entry written by the *previous* deploy's `GetHomePageUseCase` (old
 * shape) still parses as valid JSON and gets served as-is by `cacheAside`
 * for up to `HOME_TTL_SECONDS` after the new code goes live — it has no way
 * to know the shape moved under it. That's exactly what happened on
 * 2026-09-11: `testimonials`/`testimonialAggregate` were added to
 * `HomePageView`, a still-live pre-deploy cache entry lacked both fields,
 * and the storefront crashed on `testimonials.length` of `undefined` for
 * whatever was left of that entry's TTL.
 *
 * Deliberately a separate counter from `cache:catalog:version`
 * (`bumpCatalogCacheVersion()` in `catalog-cache.ts`) — that one tracks
 * admin CONTENT writes (a product/category/banner edit) and is bumped at
 * runtime; this one tracks the response SHAPE and is bumped at deploy time,
 * by hand, in code review, same as any other schema-version constant.
 */
const HOME_PAGE_SCHEMA_VERSION = 2;

/**
 * ADR-017 (Caching Strategy) — the whole aggregate cached as one unit,
 * on top of (not instead of) `listProductsUseCase`/`listCategoriesUseCase`/
 * `listVisibleBannersUseCase` already being individually cached above: this
 * collapses the full 7-way fan-out (`GetHomePageUseCase`'s own doc comment)
 * into one Redis GET on a warm cache, which is faster than even a
 * warm-but-still-parallel set of separate calls, and is what the Home-
 * navigation-latency investigation actually traced the reported stutter to
 * (every Home visit re-running this whole use-case live, with zero caching
 * anywhere in the request path — see journal.md, 2026-09-05). Composed as a
 * plain object here (same pattern every other cross-module port in this
 * codebase already uses), not inside `get-homepage.use-case.ts` itself —
 * caching is a cross-cutting infrastructure concern, not this use-case's
 * own business logic, so that file stays untouched and independently
 * testable exactly as it is today.
 *
 * Skipped under `pnpm test` (falls back to calling the real use-case
 * directly, no caching at all) — `home.integration.test.ts` creates a
 * fresh product/order/review fixture per test via raw Prisma and asserts
 * `GET /api/v1/home` reflects it immediately after; a live cache here would
 * make several of those tests fail deterministically. See
 * products.module.ts's own comment on this same pattern for the general
 * reasoning, and catalog-cache.test.ts for where the cache helper's own
 * behavior is actually verified.
 */
export const getHomePageUseCase = {
  execute: (): Promise<HomePageView> =>
    env.NODE_ENV === "test"
      ? realGetHomePageUseCase.execute()
      : cacheAside(`home:page:schema${HOME_PAGE_SCHEMA_VERSION}`, HOME_TTL_SECONDS, () => realGetHomePageUseCase.execute()),
};

const homeController = new HomeController(getHomePageUseCase);

export const router = createHomeRouter(homeController);
