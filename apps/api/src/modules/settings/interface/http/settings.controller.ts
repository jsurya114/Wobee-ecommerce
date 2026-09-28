import type { Request, Response } from "express";
import type { GetPublicAppConfigUseCase } from "../../application/use-cases/get-public-app-config.use-case";

export class SettingsController {
  constructor(private readonly getPublicAppConfigUseCase: GetPublicAppConfigUseCase) {}

  async getPublicConfig(_req: Request, res: Response): Promise<void> {
    const config = await this.getPublicAppConfigUseCase.execute();
    res.status(200).json({ config });
  }
}
