import { prisma } from "@woobe/database";
import type { ShippingRuleValues } from "../../domain/resolve-shipping";
import type { ShippingRepositoryPort } from "../../application/ports/shipping-repository.port";

/**
 * ADR-010: the ONLY file in the shipping module allowed to import
 * @woobe/database (enforced by apps/api/.dependency-cruiser.cjs).
 */
export class ShippingRepository implements ShippingRepositoryPort {
  async findCurrentRule(): Promise<ShippingRuleValues> {
    const { effectiveFrom: _effectiveFrom, ...values } = await this.findCurrentRuleWithEffectiveFrom();
    return values;
  }

  async findCurrentRuleWithEffectiveFrom(): Promise<ShippingRuleValues & { effectiveFrom: Date }> {
    const rule = await prisma.shippingRule.findFirst({
      where: { effectiveFrom: { lte: new Date() } },
      orderBy: { effectiveFrom: "desc" },
    });
    if (!rule) {
      throw new Error("No ShippingRule row found — the database is missing its seeded default rule");
    }
    return {
      minWeightGramsForCheckout: rule.minWeightGramsForCheckout,
      freeDeliveryThresholdGrams: rule.freeDeliveryThresholdGrams,
      standardFeePaise: rule.standardFeePaise,
      estimatedDeliveryDaysMin: rule.estimatedDeliveryDaysMin,
      estimatedDeliveryDaysMax: rule.estimatedDeliveryDaysMax,
      freeDeliveryMinSubtotalPaise: rule.freeDeliveryMinSubtotalPaise,
      effectiveFrom: rule.effectiveFrom,
    };
  }

  async insertRule(values: ShippingRuleValues): Promise<ShippingRuleValues & { effectiveFrom: Date }> {
    const created = await prisma.shippingRule.create({ data: { ...values, effectiveFrom: new Date() } });
    return {
      minWeightGramsForCheckout: created.minWeightGramsForCheckout,
      freeDeliveryThresholdGrams: created.freeDeliveryThresholdGrams,
      standardFeePaise: created.standardFeePaise,
      estimatedDeliveryDaysMin: created.estimatedDeliveryDaysMin,
      estimatedDeliveryDaysMax: created.estimatedDeliveryDaysMax,
      freeDeliveryMinSubtotalPaise: created.freeDeliveryMinSubtotalPaise,
      effectiveFrom: created.effectiveFrom,
    };
  }
}
