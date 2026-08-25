import { prisma } from "@woobe/database";
import type { PricingRepositoryPort } from "../../application/ports/pricing-repository.port";

/**
 * ADR-010: the ONLY file in the pricing module allowed to import
 * @woobe/database (enforced by apps/api/.dependency-cruiser.cjs).
 */
export class PricingRepository implements PricingRepositoryPort {
  async findCurrentDefaultRatePerKgPaise(): Promise<number> {
    const setting = await prisma.pricingSetting.findFirst({
      where: { effectiveFrom: { lte: new Date() } },
      orderBy: { effectiveFrom: "desc" },
    });
    if (!setting) {
      throw new Error("No PricingSetting row found — the database is missing its seeded default rate");
    }
    return setting.defaultRatePerKgPaise;
  }
}
