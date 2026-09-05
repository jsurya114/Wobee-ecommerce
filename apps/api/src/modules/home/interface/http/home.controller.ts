import type { Request, Response } from "express";
import type { HomePageView } from "../../application/use-cases/get-homepage.use-case";

/**
 * Matches `GetHomePageUseCase`'s own `execute` signature — a narrow
 * structural type (not the concrete class) so `home.module.ts` can compose
 * a cached wrapper in front of the real use-case (ADR-017) without needing
 * a subclass; the real `GetHomePageUseCase` already satisfies this as-is.
 */
interface HomePageReader {
  execute(): Promise<HomePageView>;
}

/** Public, unauthenticated — the storefront homepage, same as GET /api/v1/products. */
export class HomeController {
  constructor(private readonly getHomePageUseCase: HomePageReader) {}

  async get(_req: Request, res: Response): Promise<void> {
    const result = await this.getHomePageUseCase.execute();
    res.json(result);
  }
}
