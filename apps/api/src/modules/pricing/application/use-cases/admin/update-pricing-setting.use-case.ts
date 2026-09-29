import type { PricingRepositoryPort } from "../../ports/pricing-repository.port";
import type { PricingSettingView } from "./get-pricing-setting.use-case";

/**
 * Admin Settings' "change the global ₹/kg rate" write (MANAGE_SETTINGS,
 * super_admin only, ADR-024). Inserts a new PricingSetting row effective
 * immediately — it never updates or deletes the previous one, and never
 * touches any existing order (DEVELOPMENT_RULES.md #1: OrderItem already
 * snapshots the rate it used at checkout, independent of this table's
 * current value). Every subsequent price calculation (product display,
 * cart, checkout) picks up the new rate the moment this resolves, because
 * CalculateEffectivePriceUseCase always reads the latest row live. The
 * listing's price caches (`effectivePricePaiseCache`/`minPricePaiseCache`)
 * are NOT refreshed by any read path — the admin module re-prices them right
 * after this runs (2026-09-30, RefreshWeightBasedPriceCachesUseCase; before
 * that they silently kept the old rate).
 */
export class UpdatePricingSettingUseCase {
  constructor(private readonly pricingRepository: PricingRepositoryPort) {}

  async execute(ratePerKgPaise: number): Promise<PricingSettingView> {
    const setting = await this.pricingRepository.insertPricingSetting(ratePerKgPaise);
    return { ratePerKgPaise: setting.ratePerKgPaise, effectiveFrom: setting.effectiveFrom.toISOString() };
  }
}
