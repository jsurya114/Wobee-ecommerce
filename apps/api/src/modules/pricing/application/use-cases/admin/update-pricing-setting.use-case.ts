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
 * CalculateEffectivePriceUseCase always reads the latest row live — there
 * is no cache to invalidate here beyond the ADR-017 display cache, which
 * `Product.recomputeMinPrice`/`effectivePricePaiseCache` already refresh on
 * their own read paths.
 */
export class UpdatePricingSettingUseCase {
  constructor(private readonly pricingRepository: PricingRepositoryPort) {}

  async execute(ratePerKgPaise: number): Promise<PricingSettingView> {
    const setting = await this.pricingRepository.insertPricingSetting(ratePerKgPaise);
    return { ratePerKgPaise: setting.ratePerKgPaise, effectiveFrom: setting.effectiveFrom.toISOString() };
  }
}
