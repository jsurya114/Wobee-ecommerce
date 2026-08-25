import { applyPercentage } from "@woobe/utils";
import { resolveGstRatePercent } from "../../domain/resolve-gst-rate";
import type { PricingRepositoryPort } from "../ports/pricing-repository.port";

export interface GstLine {
  ratePercent: number;
  taxAmountPaise: number;
}

/**
 * ADR-023's tax counterpart to CalculateEffectivePriceUseCase — exported
 * from pricing.module.ts for cross-module use (orders' checkout snapshot).
 * `unitPricePaise` picks the slab (schema.prisma's GstSlab comment: tiered
 * by *per-piece* price); `lineTotalPaise` is what the rate is applied to
 * (the tax owed on the whole line, not just one unit).
 */
export class CalculateGstUseCase {
  constructor(private readonly pricingRepository: PricingRepositoryPort) {}

  async executeMany(lines: { unitPricePaise: number; lineTotalPaise: number }[]): Promise<GstLine[]> {
    const slabs = await this.pricingRepository.findActiveGstSlabs();
    return lines.map((line) => {
      const ratePercent = resolveGstRatePercent(slabs, line.unitPricePaise);
      return { ratePercent, taxAmountPaise: applyPercentage(line.lineTotalPaise, ratePercent) };
    });
  }
}
