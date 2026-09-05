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
import { getBestSellingVariantQuantitiesUseCase } from "../orders/orders.module";
import {
  getCategoryImagesUseCase,
  getProductsByIdsUseCase,
  listProductsUseCase,
  resolveProductIdsForVariantsUseCase,
} from "../products/products.module";
import { listTopApprovedReviewsUseCase } from "../reviews/reviews.module";
import { cacheAside } from "../../shared/cache/catalog-cache";
import { env } from "../../config/env";
import { GetHomePageUseCase, type HomePageView } from "./application/use-cases/get-homepage.use-case";
import { HomeController } from "./interface/http/home.controller";
import { createHomeRouter } from "./interface/http/home.routes";

const realGetHomePageUseCase = new GetHomePageUseCase(
  listProductsUseCase,
  getBestSellingVariantQuantitiesUseCase,
  resolveProductIdsForVariantsUseCase,
  getProductsByIdsUseCase,
  listCollectionsUseCase,
  listTopApprovedReviewsUseCase,
  listCategoriesUseCase,
  getCategoryImagesUseCase,
  listVisibleBannersUseCase,
  listProductsUseCase,
);

const HOME_TTL_SECONDS = 60;

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
    env.NODE_ENV === "test" ? realGetHomePageUseCase.execute() : cacheAside("home:page", HOME_TTL_SECONDS, () => realGetHomePageUseCase.execute()),
};

const homeController = new HomeController(getHomePageUseCase);

export const router = createHomeRouter(homeController);
