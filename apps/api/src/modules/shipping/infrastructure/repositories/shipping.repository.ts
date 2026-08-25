import { prisma } from "@woobe/database";
import type { ShippingRuleValues } from "../../domain/resolve-shipping";
import type { ShippingRepositoryPort } from "../../application/ports/shipping-repository.port";

/**
 * ADR-010: the ONLY file in the shipping module allowed to import
 * @woobe/database (enforced by apps/api/.dependency-cruiser.cjs).
 */
export class ShippingRepository implements ShippingRepositoryPort {
  async findCurrentRule(): Promise<ShippingRuleValues> {
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
    };
  }
}
