import type { CreateCategoryInput, ReorderCategoriesInput, SetCategoryActiveInput, UpdateCategoryInput } from "@woobe/validation";
import type { Request, Response } from "express";
import { ValidationError } from "../../../../shared/errors";
import type { CreateCategoryUseCase } from "../../../categories/application/use-cases/admin/create-category.use-case";
import type { GetCategoryAdminUseCase } from "../../../categories/application/use-cases/admin/get-category-admin.use-case";
import type { ListCategoriesAdminUseCase } from "../../../categories/application/use-cases/admin/list-categories-admin.use-case";
import type { ReorderCategoriesUseCase } from "../../../categories/application/use-cases/admin/reorder-categories.use-case";
import type { SetCategoryActiveUseCase } from "../../../categories/application/use-cases/admin/set-category-active.use-case";
import type { UpdateCategoryUseCase } from "../../../categories/application/use-cases/admin/update-category.use-case";

/** Thin permission-gated HTTP gateway onto the categories module's own exported use-cases (ADR-025) — same shape as AdminCollectionsController. */
export class AdminCategoriesController {
  constructor(
    private readonly listCategoriesAdminUseCase: ListCategoriesAdminUseCase,
    private readonly getCategoryAdminUseCase: GetCategoryAdminUseCase,
    private readonly createCategoryUseCase: CreateCategoryUseCase,
    private readonly updateCategoryUseCase: UpdateCategoryUseCase,
    private readonly setCategoryActiveUseCase: SetCategoryActiveUseCase,
    private readonly reorderCategoriesUseCase: ReorderCategoriesUseCase,
  ) {}

  async list(_req: Request, res: Response): Promise<void> {
    const categories = await this.listCategoriesAdminUseCase.execute();
    res.status(200).json({ categories });
  }

  async getOne(req: Request, res: Response): Promise<void> {
    const category = await this.getCategoryAdminUseCase.execute(requireId(req));
    res.status(200).json({ category });
  }

  async create(req: Request, res: Response): Promise<void> {
    const input = req.body as CreateCategoryInput;
    const category = await this.createCategoryUseCase.execute(input);
    res.status(201).json({ category });
  }

  async update(req: Request, res: Response): Promise<void> {
    const input = req.body as UpdateCategoryInput;
    const category = await this.updateCategoryUseCase.execute(requireId(req), input);
    res.status(200).json({ category });
  }

  async setActive(req: Request, res: Response): Promise<void> {
    const input = req.body as SetCategoryActiveInput;
    const category = await this.setCategoryActiveUseCase.execute(requireId(req), input.isActive);
    res.status(200).json({ category });
  }

  async reorder(req: Request, res: Response): Promise<void> {
    const input = req.body as ReorderCategoriesInput;
    await this.reorderCategoriesUseCase.execute(input.categoryIds);
    res.status(204).send();
  }
}

function requireId(req: Request): string {
  const id = req.params.id;
  if (!id || typeof id !== "string") {
    throw new ValidationError("Category id is required");
  }
  return id;
}
