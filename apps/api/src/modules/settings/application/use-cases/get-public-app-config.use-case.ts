import type { AppConfigRepositoryPort } from "../ports/app-config-repository.port";
import type { PricingRateReaderPort } from "../ports/pricing-rate-reader.port";
import type { ShippingRuleReaderPort } from "../ports/shipping-rule-reader.port";

/**
 * The storefront/admin-safe subset of settings — no timestamps, nothing
 * internal. Unauthenticated by design: every value here is already visible to
 * a shopper through the cart/checkout behaviour it controls.
 */
export interface PublicAppConfigView {
  minCartWeightGrams: number;
  minCartQuantity: number;
  freeDeliveryMinSubtotalPaise: number;
  returnsEnabled: boolean;
  codShippingUpfront: boolean;
  presetSizes: string[];
  presetFabrics: string[];
  presetFits: string[];
  /** Current global ₹/kg rate for WEIGHT_BASED products, integer paise (2026-09-29) — the same rate every product page already shows. */
  ratePerKgPaise: number;
}

export class GetPublicAppConfigUseCase {
  constructor(
    private readonly repository: AppConfigRepositoryPort,
    private readonly shippingRuleReader: ShippingRuleReaderPort,
    private readonly pricingRateReader: PricingRateReaderPort,
  ) {}

  async execute(): Promise<PublicAppConfigView> {
    const [config, shippingRule, ratePerKgPaise] = await Promise.all([
      this.repository.get(),
      this.shippingRuleReader.getCurrent(),
      this.pricingRateReader.getCurrentRatePerKgPaise(),
    ]);
    return {
      minCartWeightGrams: shippingRule.minWeightGramsForCheckout,
      minCartQuantity: config.minCartQuantity,
      freeDeliveryMinSubtotalPaise: shippingRule.freeDeliveryMinSubtotalPaise,
      returnsEnabled: config.returnsEnabled,
      codShippingUpfront: config.codShippingUpfront,
      presetSizes: config.presetSizes,
      presetFabrics: config.presetFabrics,
      presetFits: config.presetFits,
      ratePerKgPaise,
    };
  }
}
