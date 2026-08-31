import { resolveShippingEvaluation, type ShippingEvaluation } from "../../domain/resolve-shipping";
import type { ShippingRepositoryPort } from "../ports/shipping-repository.port";

/**
 * The single path every other module goes through to apply ADR-021's
 * weight thresholds — exported from shipping.module.ts for cross-module use
 * (cart's progress display, orders' checkout-blocking + fee snapshot).
 */
export class EvaluateShippingUseCase {
  constructor(private readonly shippingRepository: ShippingRepositoryPort) {}

  /** Caller passes the cart's WEIGHT-BASED-items-only weight (2026-08-31) — see resolveShippingEvaluation's own doc comment. */
  async execute(weightBasedTotalGrams: number): Promise<ShippingEvaluation> {
    const rule = await this.shippingRepository.findCurrentRule();
    return resolveShippingEvaluation(weightBasedTotalGrams, rule);
  }
}
