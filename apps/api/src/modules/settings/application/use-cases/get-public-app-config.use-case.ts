import type { AppConfigRepositoryPort } from "../ports/app-config-repository.port";
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
  presetSizes: string[];
  presetFabrics: string[];
  presetFits: string[];
}

export class GetPublicAppConfigUseCase {
  constructor(
    private readonly repository: AppConfigRepositoryPort,
    private readonly shippingRuleReader: ShippingRuleReaderPort,
  ) {}

  async execute(): Promise<PublicAppConfigView> {
    const [config, shippingRule] = await Promise.all([this.repository.get(), this.shippingRuleReader.getCurrent()]);
    return {
      minCartWeightGrams: shippingRule.minWeightGramsForCheckout,
      minCartQuantity: config.minCartQuantity,
      freeDeliveryMinSubtotalPaise: shippingRule.freeDeliveryMinSubtotalPaise,
      returnsEnabled: config.returnsEnabled,
      presetSizes: config.presetSizes,
      presetFabrics: config.presetFabrics,
      presetFits: config.presetFits,
    };
  }
}
