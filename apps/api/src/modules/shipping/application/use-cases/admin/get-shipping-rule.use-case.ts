import type { ShippingRuleValues } from "../../../domain/resolve-shipping";
import type { ShippingRepositoryPort } from "../../ports/shipping-repository.port";

export interface ShippingRuleView extends ShippingRuleValues {
  effectiveFrom: string;
}

/** Admin Settings' "Cart & Shipping Rules" read (MANAGE_SETTINGS) — the same latest-effective row cart and checkout evaluate against. */
export class GetShippingRuleUseCase {
  constructor(private readonly shippingRepository: ShippingRepositoryPort) {}

  async execute(): Promise<ShippingRuleView> {
    const rule = await this.shippingRepository.findCurrentRuleWithEffectiveFrom();
    return { ...rule, effectiveFrom: rule.effectiveFrom.toISOString() };
  }
}
