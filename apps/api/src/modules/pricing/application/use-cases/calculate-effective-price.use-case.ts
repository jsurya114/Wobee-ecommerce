import { calculateWeightBasedPricePaise } from "@woobe/utils";
import { resolveEffectiveRatePerKgPaise } from "../../domain/resolve-effective-rate";
import type { PricingRepositoryPort } from "../ports/pricing-repository.port";

export interface EffectivePrice {
  pricePaise: number;
  ratePerKgPaise: number;
}

/**
 * The single path every other module goes through to price a variant
 * (DEVELOPMENT_RULES.md #1 — never trust the client for price). Exported
 * from pricing.module.ts for cross-module use (products' detail page,
 * cart's live recalculation) — those modules depend on this class, not on
 * PricingRepository/Prisma, so ADR-010's boundary holds even though the
 * call crosses a module.
 */
export class CalculateEffectivePriceUseCase {
  constructor(private readonly pricingRepository: PricingRepositoryPort) {}

  async execute(input: { weightGrams: number; ratePerKgOverridePaise: number | null }): Promise<EffectivePrice> {
    const defaultRate = await this.pricingRepository.findCurrentDefaultRatePerKgPaise();
    const ratePerKgPaise = resolveEffectiveRatePerKgPaise(defaultRate, input.ratePerKgOverridePaise);
    const pricePaise = calculateWeightBasedPricePaise(input.weightGrams, ratePerKgPaise);
    return { pricePaise, ratePerKgPaise };
  }

  /** Batched form — one findCurrentDefaultRatePerKgPaise() call for N variants instead of N (listing/cart hot paths). */
  async executeMany(
    inputs: { weightGrams: number; ratePerKgOverridePaise: number | null }[],
  ): Promise<EffectivePrice[]> {
    const defaultRate = await this.pricingRepository.findCurrentDefaultRatePerKgPaise();
    return inputs.map((input) => {
      const ratePerKgPaise = resolveEffectiveRatePerKgPaise(defaultRate, input.ratePerKgOverridePaise);
      return { pricePaise: calculateWeightBasedPricePaise(input.weightGrams, ratePerKgPaise), ratePerKgPaise };
    });
  }
}
