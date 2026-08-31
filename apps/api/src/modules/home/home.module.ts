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
import { GetHomePageUseCase } from "./application/use-cases/get-homepage.use-case";
import { HomeController } from "./interface/http/home.controller";
import { createHomeRouter } from "./interface/http/home.routes";

const getHomePageUseCase = new GetHomePageUseCase(
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

const homeController = new HomeController(getHomePageUseCase);

export const router = createHomeRouter(homeController);
