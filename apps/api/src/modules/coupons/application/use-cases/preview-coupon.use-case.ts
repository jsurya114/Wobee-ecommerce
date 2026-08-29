import { calculateCouponDiscount } from "../../domain/calculate-coupon-discount";
import { resolveCouponEligibility, type CouponLineInput } from "../../domain/resolve-coupon-eligibility";
import type { CouponRepositoryPort } from "../ports/coupon-repository.port";

export interface PreviewCouponInput {
  code: string;
  userId: string;
  cartSubtotalPaise: number;
  lines: CouponLineInput[];
}

export interface CouponPreviewResult {
  ok: boolean;
  reason?: string;
  discountPaise: number;
}

/**
 * Non-authoritative preview — cart's "Apply coupon" action and the cart
 * page's own redisplay of an already-applied code both use this (week2
 * (1).md §9's "Validate coupon" step). NOT the redemption path: no row
 * lock, no CouponRedemption row created here — see RedeemCouponUseCase for
 * that, which re-runs this exact same eligibility logic live at checkout
 * rather than trusting whatever this returned a moment ago.
 */
export class PreviewCouponUseCase {
  constructor(private readonly couponRepository: CouponRepositoryPort) {}

  async execute(input: PreviewCouponInput): Promise<CouponPreviewResult> {
    const coupon = await this.couponRepository.findByCode(input.code);
    if (!coupon) {
      return { ok: false, reason: "Coupon not found", discountPaise: 0 };
    }

    const [globalRedemptionCount, userRedemptionCount] = await Promise.all([
      this.couponRepository.countGlobalRedemptions(coupon.id),
      this.couponRepository.countUserRedemptions(coupon.id, input.userId),
    ]);

    const eligibility = resolveCouponEligibility(coupon, {
      now: new Date(),
      cartSubtotalPaise: input.cartSubtotalPaise,
      globalRedemptionCount,
      userRedemptionCount,
      lines: input.lines,
    });

    if (!eligibility.ok) {
      return { ok: false, reason: eligibility.reason, discountPaise: 0 };
    }

    return { ok: true, discountPaise: calculateCouponDiscount(coupon, eligibility.eligibleLineTotalPaise) };
  }
}
