import type { PricingRepositoryPort } from "../../ports/pricing-repository.port";

export interface PricingSettingView {
  ratePerKgPaise: number;
  effectiveFrom: string;
}

/** Admin Settings' "current rate" read (MANAGE_SETTINGS, ADR-024) — the same latest-effective-row lookup checkout uses, plus when it took effect. */
export class GetPricingSettingUseCase {
  constructor(private readonly pricingRepository: PricingRepositoryPort) {}

  async execute(): Promise<PricingSettingView> {
    const setting = await this.pricingRepository.findCurrentPricingSetting();
    return { ratePerKgPaise: setting.ratePerKgPaise, effectiveFrom: setting.effectiveFrom.toISOString() };
  }
}
