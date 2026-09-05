// Composition root for the categories module (ARCHITECTURE.md §3.2). Public
// GET here; admin CRUD is exported below for the `admin` module's thin HTTP
// gateway to wire up (2026-09-02), same pattern collections.module.ts/
// banners.module.ts already use.
import { FindCategoryBySlugUseCase } from "./application/use-cases/find-category-by-slug.use-case";
import { ListCategoriesUseCase } from "./application/use-cases/list-categories.use-case";
import { CreateCategoryUseCase } from "./application/use-cases/admin/create-category.use-case";
import { GetCategoryAdminUseCase } from "./application/use-cases/admin/get-category-admin.use-case";
import { ListCategoriesAdminUseCase } from "./application/use-cases/admin/list-categories-admin.use-case";
import { ReorderCategoriesUseCase } from "./application/use-cases/admin/reorder-categories.use-case";
import { SetCategoryActiveUseCase } from "./application/use-cases/admin/set-category-active.use-case";
import { UpdateCategoryUseCase } from "./application/use-cases/admin/update-category.use-case";
import type { CategoryRepositoryPort } from "./application/ports/category-repository.port";
import { CachedCategoryRepository } from "./infrastructure/repositories/cached-category-repository";
import { CategoryRepository } from "./infrastructure/repositories/category.repository";
import { CategoriesController } from "./interface/http/categories.controller";
import { createCategoriesRouter } from "./interface/http/categories.routes";
import { env } from "../../config/env";

// ADR-017 (Caching Strategy) — see CachedCategoryRepository's own doc
// comment for exactly what's cached (findActiveCategories only) vs. left
// live (admin reads, findIdBySlug). Skipped under `pnpm test` — see
// products.module.ts's own comment on this same pattern for why.
const realCategoryRepository = new CategoryRepository();
const categoryRepository: CategoryRepositoryPort =
  env.NODE_ENV === "test" ? realCategoryRepository : new CachedCategoryRepository(realCategoryRepository);

/** Exported for cross-module use — `home` composes the active category list into its category-rail payload (redesign §B). */
export const listCategoriesUseCase = new ListCategoriesUseCase(categoryRepository);

/** Exported for cross-module use — see the use-case's own doc comment. */
export const findCategoryBySlugUseCase = new FindCategoryBySlugUseCase(categoryRepository);

// Exported for the admin module's thin HTTP gateway (ADR-025).
export const listCategoriesAdminUseCase = new ListCategoriesAdminUseCase(categoryRepository);
export const getCategoryAdminUseCase = new GetCategoryAdminUseCase(categoryRepository);
export const createCategoryUseCase = new CreateCategoryUseCase(categoryRepository);
export const updateCategoryUseCase = new UpdateCategoryUseCase(categoryRepository);
export const setCategoryActiveUseCase = new SetCategoryActiveUseCase(categoryRepository);
export const reorderCategoriesUseCase = new ReorderCategoriesUseCase(categoryRepository);

const categoriesController = new CategoriesController(listCategoriesUseCase);

export const router = createCategoriesRouter(categoriesController);
