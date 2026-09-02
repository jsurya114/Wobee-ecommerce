import type { UpdatePricingSettingInput } from "@woobe/validation";
import type { Request, Response } from "express";
import type { GetPricingSettingUseCase } from "../../../pricing/application/use-cases/admin/get-pricing-setting.use-case";
import type { UpdatePricingSettingUseCase } from "../../../pricing/application/use-cases/admin/update-pricing-setting.use-case";

/** Thin permission-gated HTTP gateway onto the pricing module's own exported use-cases (ADR-025) — same shape as AdminBannersController. */
export class AdminSettingsController {
  constructor(
    private readonly getPricingSettingUseCase: GetPricingSettingUseCase,
    private readonly updatePricingSettingUseCase: UpdatePricingSettingUseCase,
  ) {}

  async getPricing(_req: Request, res: Response): Promise<void> {
    const setting = await this.getPricingSettingUseCase.execute();
    res.status(200).json({ setting });
  }

  async updatePricing(req: Request, res: Response): Promise<void> {
    const input = req.body as UpdatePricingSettingInput;
    const setting = await this.updatePricingSettingUseCase.execute(input.ratePerKgPaise);
    res.status(200).json({ setting });
  }
}
