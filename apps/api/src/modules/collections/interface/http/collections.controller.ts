import type { Request, Response } from "express";
import { ValidationError } from "../../../../shared/errors";
import type { GetCollectionDetailUseCase } from "../../application/use-cases/get-collection-detail.use-case";
import type { ListCollectionsUseCase } from "../../application/use-cases/list-collections.use-case";

/** Controllers stay thin — parse request, call use-case, map result to response. Customer-facing only; admin CRUD is AdminCollectionsController (apps/api/src/modules/admin). */
export class CollectionsController {
  constructor(
    private readonly listCollectionsUseCase: ListCollectionsUseCase,
    private readonly getCollectionDetailUseCase: GetCollectionDetailUseCase,
  ) {}

  async list(_req: Request, res: Response): Promise<void> {
    const collections = await this.listCollectionsUseCase.execute();
    res.status(200).json({ collections });
  }

  async getBySlug(req: Request, res: Response): Promise<void> {
    const slug = req.params.slug;
    if (!slug || typeof slug !== "string") {
      throw new ValidationError("Collection slug is required");
    }
    const collection = await this.getCollectionDetailUseCase.execute(slug);
    res.status(200).json({ collection });
  }
}
