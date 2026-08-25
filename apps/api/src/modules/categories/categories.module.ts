// Composition root for the categories module (ARCHITECTURE.md §3.2).
import { FindCategoryBySlugUseCase } from "./application/use-cases/find-category-by-slug.use-case";
import { ListCategoriesUseCase } from "./application/use-cases/list-categories.use-case";
import { CategoryRepository } from "./infrastructure/repositories/category.repository";
import { CategoriesController } from "./interface/http/categories.controller";
import { createCategoriesRouter } from "./interface/http/categories.routes";

const categoryRepository = new CategoryRepository();

const listCategoriesUseCase = new ListCategoriesUseCase(categoryRepository);

/** Exported for cross-module use — see the use-case's own doc comment. */
export const findCategoryBySlugUseCase = new FindCategoryBySlugUseCase(categoryRepository);

const categoriesController = new CategoriesController(listCategoriesUseCase);

export const router = createCategoriesRouter(categoriesController);
