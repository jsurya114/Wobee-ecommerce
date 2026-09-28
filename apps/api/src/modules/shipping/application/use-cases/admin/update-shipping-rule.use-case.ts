import type { UpdateShippingRuleInput } from "@woobe/validation";
import type { ShippingRepositoryPort } from "../../ports/shipping-repository.port";
import type { ShippingRuleView } from "./get-shipping-rule.use-case";

/**
 * Admin Settings' "Cart & Shipping Rules" write (MANAGE_SETTINGS, super_admin
 * only). A partial patch is merged onto the CURRENT rule and inserted as a new
 * row effective immediately (append-only, same contract as
 * UpdatePricingSettingUseCase) — history is never rewritten, and every
 * already-placed order keeps its own snapshotted shippingFeePaise. Cart and
 * checkout read the latest row live on every request, so nothing needs
 * invalidating.
 */
export class UpdateShippingRuleUseCase {
  constructor(private readonly shippingRepository: ShippingRepositoryPort) {}

  async execute(patch: UpdateShippingRuleInput): Promise<ShippingRuleView> {
    const { effectiveFrom: _previous, ...current } = await this.shippingRepository.findCurrentRuleWithEffectiveFrom();
    const created = await this.shippingRepository.insertRule({ ...current, ...patch });
    return { ...created, effectiveFrom: created.effectiveFrom.toISOString() };
  }
}
