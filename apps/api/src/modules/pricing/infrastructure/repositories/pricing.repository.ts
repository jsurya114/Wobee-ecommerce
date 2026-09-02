import { prisma } from "@woobe/database";
import type { GstSlabValues } from "../../domain/resolve-gst-rate";
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

  async findCurrentPricingSetting(): Promise<{ ratePerKgPaise: number; effectiveFrom: Date }> {
    const setting = await prisma.pricingSetting.findFirst({
      where: { effectiveFrom: { lte: new Date() } },
      orderBy: { effectiveFrom: "desc" },
    });
    if (!setting) {
      throw new Error("No PricingSetting row found — the database is missing its seeded default rate");
    }
    return { ratePerKgPaise: setting.defaultRatePerKgPaise, effectiveFrom: setting.effectiveFrom };
  }

  async insertPricingSetting(ratePerKgPaise: number): Promise<{ ratePerKgPaise: number; effectiveFrom: Date }> {
    // Append-only (model's own doc comment) — a new row effective now(),
    // never an update. Past PricingSetting rows, and every already-placed
    // order's own OrderItem snapshot, are untouched.
    const created = await prisma.pricingSetting.create({
      data: { defaultRatePerKgPaise: ratePerKgPaise, effectiveFrom: new Date() },
    });
    return { ratePerKgPaise: created.defaultRatePerKgPaise, effectiveFrom: created.effectiveFrom };
  }

  async findActiveGstSlabs(): Promise<GstSlabValues[]> {
    const slabs = await prisma.gstSlab.findMany({ select: { maxPricePaise: true, ratePercent: true } });
    if (slabs.length === 0) {
      throw new Error("No GstSlab rows found — the database is missing its seeded GST slabs");
    }
    return slabs;
  }
}
