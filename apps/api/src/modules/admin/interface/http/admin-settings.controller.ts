import type { UpdateAppConfigInput, UpdatePricingSettingInput, UpdateShippingRuleInput } from "@woobe/validation";
import type { Request, Response } from "express";
import type { GetPricingSettingUseCase } from "../../../pricing/application/use-cases/admin/get-pricing-setting.use-case";
import type { UpdatePricingSettingUseCase } from "../../../pricing/application/use-cases/admin/update-pricing-setting.use-case";
import type { GetAppConfigUseCase } from "../../../settings/application/use-cases/get-app-config.use-case";
import type { UpdateAppConfigUseCase } from "../../../settings/application/use-cases/update-app-config.use-case";
import type { GetShippingRuleUseCase } from "../../../shipping/application/use-cases/admin/get-shipping-rule.use-case";
import type { UpdateShippingRuleUseCase } from "../../../shipping/application/use-cases/admin/update-shipping-rule.use-case";

/**
 * Thin permission-gated HTTP gateway onto the pricing, settings and shipping
 * modules' own exported use-cases (ADR-025) — same shape as AdminBannersController.
 */
export class AdminSettingsController {
  constructor(
    private readonly getPricingSettingUseCase: GetPricingSettingUseCase,
    private readonly updatePricingSettingUseCase: UpdatePricingSettingUseCase,
    private readonly getAppConfigUseCase: GetAppConfigUseCase,
    private readonly updateAppConfigUseCase: UpdateAppConfigUseCase,
    private readonly getShippingRuleUseCase: GetShippingRuleUseCase,
    private readonly updateShippingRuleUseCase: UpdateShippingRuleUseCase,
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

  async getConfig(_req: Request, res: Response): Promise<void> {
    const config = await this.getAppConfigUseCase.execute();
    res.status(200).json({ config });
  }

  async updateConfig(req: Request, res: Response): Promise<void> {
    const config = await this.updateAppConfigUseCase.execute(req.body as UpdateAppConfigInput);
    res.status(200).json({ config });
  }

  async getShippingRule(_req: Request, res: Response): Promise<void> {
    const rule = await this.getShippingRuleUseCase.execute();
    res.status(200).json({ rule });
  }

  async updateShippingRule(req: Request, res: Response): Promise<void> {
    const rule = await this.updateShippingRuleUseCase.execute(req.body as UpdateShippingRuleInput);
    res.status(200).json({ rule });
  }
}
