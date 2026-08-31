import type { PricingMode } from "@woobe/types";
import { calculateWeightBasedPricePaise } from "@woobe/utils";
import { ValidationError } from "../../../shared/errors";
import { resolveEffectiveRatePerKgPaise } from "./resolve-effective-rate";

export interface ResolveEffectivePriceInput {
  pricingMode: PricingMode;
  weightGrams: number;
  ratePerKgOverridePaise: number | null;
  /** Authoritative for FIXED; ignored for WEIGHT_BASED. */
  fixedPricePaise: number | null;
}

export interface ResolvedEffectivePrice {
  pricePaise: number;
  /** Null for FIXED — there is no rate/kg to show or snapshot. */
  ratePerKgPaise: number | null;
}

/**
 * Pure domain function — no I/O (ARCHITECTURE.md §3.1). The one place
 * "weight-based math vs. admin-set fixed price" is decided, per the
 * 2026-08-31 client-reported business rule (see PricingMode's own doc
 * comment in schema.prisma) — every caller of CalculateEffectivePriceUseCase
 * goes through this, so the branch can't drift between listing/cart/checkout.
 */
export function resolveEffectivePrice(input: ResolveEffectivePriceInput, defaultRatePerKgPaise: number): ResolvedEffectivePrice {
  if (input.pricingMode === "FIXED") {
    if (input.fixedPricePaise == null) {
      // A FIXED-category variant with no price set is a data-entry defect —
      // admin's create/update-variant validation is meant to catch this
      // before it ever reaches here (never silently 0, never fall back to
      // weight math for a category that isn't priced that way).
      throw new ValidationError("This product has no fixed price set");
    }
    return { pricePaise: input.fixedPricePaise, ratePerKgPaise: null };
  }

  const ratePerKgPaise = resolveEffectiveRatePerKgPaise(defaultRatePerKgPaise, input.ratePerKgOverridePaise);
  return { pricePaise: calculateWeightBasedPricePaise(input.weightGrams, ratePerKgPaise), ratePerKgPaise };
}
