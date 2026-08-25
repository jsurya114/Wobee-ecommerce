export interface ShippingRuleValues {
  minWeightGramsForCheckout: number;
  freeDeliveryThresholdGrams: number;
  standardFeePaise: number;
}

export interface ShippingEvaluation {
  meetsMinimum: boolean;
  isFreeDelivery: boolean;
  /** 0 when isFreeDelivery, standardFeePaise when meetsMinimum but under the free-delivery threshold, and 0 when !meetsMinimum (checkout is blocked before a fee would ever apply). */
  shippingFeePaise: number;
  /** How many more grams the cart needs to clear checkout, 0 once meetsMinimum. */
  gramsToMinimum: number;
  /** How many more grams the cart needs for free delivery, 0 once isFreeDelivery. */
  gramsToFreeDelivery: number;
}

/**
 * Pure domain function — no I/O (ARCHITECTURE.md §3.1, ADR-021). Thresholds
 * and fee are always the caller's live `ShippingRule` values (ADR-023:
 * admin-configurable, never hardcoded) — this function only encodes the
 * weight-band logic itself, so "which band applies" can't drift between the
 * cart's progress display and checkout's blocking check (shipping.module.ts's
 * own composition-root comment: fee/threshold logic here, checkout-blocking
 * validation + progress data surfaced through the cart module).
 */
export function resolveShippingEvaluation(totalWeightGrams: number, rule: ShippingRuleValues): ShippingEvaluation {
  const meetsMinimum = totalWeightGrams >= rule.minWeightGramsForCheckout;
  const isFreeDelivery = totalWeightGrams >= rule.freeDeliveryThresholdGrams;

  return {
    meetsMinimum,
    isFreeDelivery,
    shippingFeePaise: meetsMinimum && !isFreeDelivery ? rule.standardFeePaise : 0,
    gramsToMinimum: Math.max(0, rule.minWeightGramsForCheckout - totalWeightGrams),
    gramsToFreeDelivery: Math.max(0, rule.freeDeliveryThresholdGrams - totalWeightGrams),
  };
}
