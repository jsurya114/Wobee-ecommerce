export interface UnitCostInputs {
  pricingMode: "WEIGHT_BASED" | "FIXED";
  /** Product.costPerKgPaise — used only for WEIGHT_BASED. */
  costPerKgPaise: number | null;
  /** ProductVariant.costPricePaise — used only for FIXED. */
  costPricePaise: number | null;
  weightGrams: number;
}

/**
 * The per-unit cost (paise) frozen onto an OrderItem at order time, so profit
 * is measured against what the goods cost THEN, not against a later cost edit
 * (same snapshot rule as unitPricePaise / weightGrams). WEIGHT_BASED:
 * cost-per-kg x weight; FIXED: the variant's per-piece cost. Returns null —
 * never 0 — when no cost is configured, so the dashboard can report a
 * coverage gap instead of treating unknown cost as free.
 */
export function computeUnitCostSnapshot(input: UnitCostInputs): number | null {
  if (input.pricingMode === "FIXED") {
    return input.costPricePaise !== null && input.costPricePaise >= 0 ? input.costPricePaise : null;
  }
  if (input.costPerKgPaise === null || input.costPerKgPaise < 0 || input.weightGrams < 0) return null;
  return Math.round((input.costPerKgPaise * input.weightGrams) / 1000);
}
