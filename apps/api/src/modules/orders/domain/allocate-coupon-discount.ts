export interface DiscountEligibleLine {
  variantId: string;
  lineTotalPaise: number;
}

/**
 * Pure, dependency-free — splits a coupon's order-level `discountPaise`
 * back across the specific order lines it applies to (week2 (1).md §9's
 * own "Calculate discount -> Recalculate tax" ordering requires a per-line
 * amount before GST can be recomputed on the discounted value, but Coupon
 * discounts are calculated cart-wide, not per-line — see
 * calculateCouponDiscount).
 *
 * Allocated proportionally to each eligible line's share of the eligible
 * subtotal, using the largest-remainder method so the returned amounts
 * always sum to EXACTLY `discountPaise` (never a paise short or over from
 * naive per-line rounding — money must reconcile exactly, DEVELOPMENT_RULES.md #1).
 *
 * Keyed by `variantId`, not `productId` — two order lines can share a
 * product (e.g. the same product in two sizes), and CartItem/OrderItem are
 * both one row per variant, so variantId is the only key guaranteed unique
 * per line (see CouponLineInput's own doc comment for the same reasoning).
 */
export function allocateCouponDiscount(discountPaise: number, eligibleLines: DiscountEligibleLine[]): Map<string, number> {
  const allocation = new Map<string, number>();
  if (discountPaise <= 0 || eligibleLines.length === 0) {
    return allocation;
  }

  const eligibleTotalPaise = eligibleLines.reduce((sum, line) => sum + line.lineTotalPaise, 0);
  if (eligibleTotalPaise <= 0) {
    return allocation;
  }

  const shares = eligibleLines.map((line) => (discountPaise * line.lineTotalPaise) / eligibleTotalPaise);
  const floored = shares.map(Math.floor);
  const flooredTotal = floored.reduce((sum, v) => sum + v, 0);
  let remainder = discountPaise - flooredTotal;

  // Largest-remainder method: the leftover paise lost to flooring go one at
  // a time to the lines with the biggest fractional remainder, so the sum
  // of allocated amounts always equals discountPaise exactly.
  const byFractionDesc = shares
    .map((share, i) => ({ i, fraction: share - Math.floor(share) }))
    .sort((a, b) => b.fraction - a.fraction);

  for (const { i } of byFractionDesc) {
    if (remainder <= 0) break;
    floored[i]! += 1;
    remainder -= 1;
  }

  eligibleLines.forEach((line, i) => allocation.set(line.variantId, floored[i]!));
  return allocation;
}
