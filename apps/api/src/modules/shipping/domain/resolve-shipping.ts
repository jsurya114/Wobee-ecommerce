export interface ShippingRuleValues {
  minWeightGramsForCheckout: number;
  freeDeliveryThresholdGrams: number;
  standardFeePaise: number;
  /** Week 2 Day 5 (week2 (1).md §10) — admin-configurable, see ShippingRule's own schema comment for why these are placeholders, not an approved SLA. */
  estimatedDeliveryDaysMin: number;
  estimatedDeliveryDaysMax: number;
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
  /** Week 2 Day 5 — passed through from the live rule so cart/checkout never need a second round-trip just to show "arrives in N-M days". */
  estimatedDeliveryDaysMin: number;
  estimatedDeliveryDaysMax: number;
}

/**
 * Pure domain function — no I/O (ARCHITECTURE.md §3.1, ADR-021). Thresholds
 * and fee are always the caller's live `ShippingRule` values (ADR-023:
 * admin-configurable, never hardcoded) — this function only encodes the
 * weight-band logic itself, so "which band applies" can't drift between the
 * cart's progress display and checkout's blocking check (shipping.module.ts's
 * own composition-root comment: fee/threshold logic here, checkout-blocking
 * validation + progress data surfaced through the cart module).
 *
 * `weightBasedTotalGrams` (2026-08-31, client-reported business rule): the
 * caller passes the cart's WEIGHT-BASED-items-only weight here, not its full
 * physical weight (cart/domain/compute-cart-totals.ts computes both) — the
 * "smart cart" minimum/free-delivery mechanic only makes sense for
 * weight-priced goods. A cart with zero weight-based items (all
 * fixed-price accessories, or empty) is never blocked by the minimum and
 * never reaches free delivery either — it falls to the standard flat fee,
 * the same band a 1,000-1,499g weight-based cart pays today, not a new tier.
 */
export function resolveShippingEvaluation(weightBasedTotalGrams: number, rule: ShippingRuleValues): ShippingEvaluation {
  const hasWeightBasedItems = weightBasedTotalGrams > 0;
  const meetsMinimum = !hasWeightBasedItems || weightBasedTotalGrams >= rule.minWeightGramsForCheckout;
  const isFreeDelivery = hasWeightBasedItems && weightBasedTotalGrams >= rule.freeDeliveryThresholdGrams;

  return {
    meetsMinimum,
    isFreeDelivery,
    shippingFeePaise: meetsMinimum && !isFreeDelivery ? rule.standardFeePaise : 0,
    gramsToMinimum: hasWeightBasedItems ? Math.max(0, rule.minWeightGramsForCheckout - weightBasedTotalGrams) : 0,
    gramsToFreeDelivery: hasWeightBasedItems ? Math.max(0, rule.freeDeliveryThresholdGrams - weightBasedTotalGrams) : 0,
    estimatedDeliveryDaysMin: rule.estimatedDeliveryDaysMin,
    estimatedDeliveryDaysMax: rule.estimatedDeliveryDaysMax,
  };
}

const PINCODE_PATTERN = /^\d{6}$/;

export interface PincodeServiceability {
  serviceable: boolean;
  reason?: string;
}

/**
 * Week 2 Day 5 (week2 (1).md §10 — "Pincode/serviceability"). No approved
 * restricted-area list exists yet (nothing in plan.md/architecture.md names
 * one, and DECISIONS_PENDING.md has no entry for it) — every well-formed
 * 6-digit Indian pincode is serviceable today. This is the seam a real
 * restricted-pincode table would plug into later (this function's caller,
 * not its shape, would change) — not a placeholder that silently
 * fabricates non-serviceable areas nobody approved.
 */
export function checkPincodeServiceability(pincode: string): PincodeServiceability {
  if (!PINCODE_PATTERN.test(pincode)) {
    return { serviceable: false, reason: "Enter a valid 6-digit pincode" };
  }
  return { serviceable: true };
}
