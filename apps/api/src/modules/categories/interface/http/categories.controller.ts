import type { Request, Response } from "express";
import type { ListCategoriesUseCase } from "../../application/use-cases/list-categories.use-case";

/** Controllers stay thin — parse request, call use-case, map result to response. */
export class CategoriesController {
  constructor(private readonly listCategoriesUseCase: ListCategoriesUseCase) {}

  async list(_req: Request, res: Response): Promise<void> {
    const categories = await this.listCategoriesUseCase.execute();
    res.status(200).json({ categories });
  }
}
