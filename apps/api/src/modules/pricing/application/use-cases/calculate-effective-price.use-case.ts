import { resolveEffectivePrice, type ResolveEffectivePriceInput } from "../../domain/resolve-effective-price";
import type { PricingRepositoryPort } from "../ports/pricing-repository.port";

export type EffectivePriceInput = ResolveEffectivePriceInput;

export interface EffectivePrice {
  pricePaise: number;
  /** Null for FIXED — there is no rate/kg to show or snapshot. */
  ratePerKgPaise: number | null;
}

/**
 * The single path every other module goes through to price a variant
 * (DEVELOPMENT_RULES.md #1 — never trust the client for price). Exported
 * from pricing.module.ts for cross-module use (products' detail page,
 * cart's live recalculation) — those modules depend on this class, not on
 * PricingRepository/Prisma, so ADR-010's boundary holds even though the
 * call crosses a module. Branches on `pricingMode` (2026-08-31) — see
 * resolve-effective-price.ts's own doc comment.
 */
export class CalculateEffectivePriceUseCase {
  constructor(private readonly pricingRepository: PricingRepositoryPort) {}

  async execute(input: EffectivePriceInput): Promise<EffectivePrice> {
    const defaultRate = await this.pricingRepository.findCurrentDefaultRatePerKgPaise();
    return resolveEffectivePrice(input, defaultRate);
  }

  /** Batched form — one findCurrentDefaultRatePerKgPaise() call for N variants instead of N (listing/cart hot paths). */
  async executeMany(inputs: EffectivePriceInput[]): Promise<EffectivePrice[]> {
    const defaultRate = await this.pricingRepository.findCurrentDefaultRatePerKgPaise();
    return inputs.map((input) => resolveEffectivePrice(input, defaultRate));
  }
}
