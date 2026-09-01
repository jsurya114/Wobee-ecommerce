import type { ShippingProgress } from "../api/cart.client";

/**
 * Pure derivation of the weight-threshold message/state — extracted (UI
 * refinement pass) so `WeightThresholdBanner` (the full inline cart-page
 * version) and `FloatingCartWeightIndicator` (the compact persistent pill)
 * render from the exact same server-computed `shipping` fields instead of
 * two independently hand-written copies of this branching. Reads only
 * `weightBasedTotalGrams` + `shipping` (both server-authoritative, ADR-011)
 * — no threshold value is ever hardcoded here, only grams-remaining deltas
 * the server already computed against whatever its configured minimum/
 * free-delivery thresholds are.
 */
export type WeightStatus =
  | { kind: "free-delivery" }
  | { kind: "below-minimum"; gramsRemaining: number; percent: number }
  | { kind: "toward-free-delivery"; gramsRemaining: number; percent: number };

export function deriveWeightStatus(weightBasedTotalGrams: number, shipping: ShippingProgress): WeightStatus | null {
  if (weightBasedTotalGrams === 0) return null;

  if (shipping.isFreeDelivery) {
    return { kind: "free-delivery" };
  }

  if (!shipping.meetsMinimum) {
    const target = weightBasedTotalGrams + shipping.gramsToMinimum;
    return {
      kind: "below-minimum",
      gramsRemaining: shipping.gramsToMinimum,
      percent: target > 0 ? (weightBasedTotalGrams / target) * 100 : 0,
    };
  }

  const target = weightBasedTotalGrams + shipping.gramsToFreeDelivery;
  return {
    kind: "toward-free-delivery",
    gramsRemaining: shipping.gramsToFreeDelivery,
    percent: target > 0 ? (weightBasedTotalGrams / target) * 100 : 0,
  };
}
