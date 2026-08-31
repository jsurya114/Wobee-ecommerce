import type { Request, Response } from "express";
import type { ListVisibleBannersUseCase } from "../../application/use-cases/list-visible-banners.use-case";

export class BannersController {
  constructor(private readonly listVisibleBannersUseCase: ListVisibleBannersUseCase) {}

  async list(_req: Request, res: Response): Promise<void> {
    const banners = await this.listVisibleBannersUseCase.execute();
    res.status(200).json({ banners });
  }
}
