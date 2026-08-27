import type { Request, Response } from "express";
import type { ListCollectionsUseCase } from "../../application/use-cases/list-collections.use-case";

/** Controllers stay thin — parse request, call use-case, map result to response. */
export class CollectionsController {
  constructor(private readonly listCollectionsUseCase: ListCollectionsUseCase) {}

  async list(_req: Request, res: Response): Promise<void> {
    const collections = await this.listCollectionsUseCase.execute();
    res.status(200).json({ collections });
  }
}
