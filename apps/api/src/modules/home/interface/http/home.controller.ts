import type { Request, Response } from "express";
import type { GetHomePageUseCase } from "../../application/use-cases/get-homepage.use-case";

/** Public, unauthenticated — the storefront homepage, same as GET /api/v1/products. */
export class HomeController {
  constructor(private readonly getHomePageUseCase: GetHomePageUseCase) {}

  async get(_req: Request, res: Response): Promise<void> {
    const result = await this.getHomePageUseCase.execute();
    res.json(result);
  }
}
