import { NotFoundError, UnprocessableEntityError } from "../../../../shared/errors";
import { calculateCouponDiscount } from "../../domain/calculate-coupon-discount";
import { resolveCouponEligibility, type CouponLineInput } from "../../domain/resolve-coupon-eligibility";
import type { CouponRepositoryPort } from "../ports/coupon-repository.port";

export interface ValidateAndLockCouponInput {
  code: string;
  userId: string;
  cartSubtotalPaise: number;
  lines: CouponLineInput[];
}

export interface ValidateAndLockCouponResult {
  couponId: string;
  discountPaise: number;
  /** So the caller (checkout) can allocate the discount per-line before recalculating tax — week2 (1).md §9's own "Calculate discount -> Recalculate tax" ordering. */
  eligibleLines: CouponLineInput[];
}

/**
 * The AUTHORITATIVE coupon application (week2 (1).md §9's mandatory
 * "Concurrent redemption" test) — called from inside orders' checkout
 * Unit-of-Work transaction (`tx`, same opaque-handle pattern every other
 * cross-module transactional call in this codebase uses).
 *
 * Split into two steps, not one, because of a real ordering constraint:
 * `CouponRedemption.orderId` is required, but the Order row doesn't exist
 * yet at the point a coupon needs to be validated — checkout needs the
 * discount amount BEFORE it can compute `Order.totalPaise` and create that
 * row. So: `validateAndLock` runs first (locks the Coupon row — see
 * CouponRepositoryPort.lockForRedemption's own doc comment for why that's
 * the real concurrency guard — counts existing redemptions, re-validates
 * every rule from scratch exactly as if this were the first time, and
 * returns the discount) and does NOT create the redemption row yet;
 * `finalize` runs after the order exists, inside the SAME transaction
 * (the lock acquired by `validateAndLock` is still held — Postgres holds
 * row locks for the transaction's full duration, not just one statement),
 * and only then writes CouponRedemption. A coupon that was valid when the
 * cart previewed it a minute ago is re-checked here as if for the first
 * time, never trusted from that earlier check (DEVELOPMENT_RULES.md #1's
 * spirit applied to coupons, not just money).
 *
 * Throwing from `validateAndLock` rolls back the WHOLE checkout
 * transaction (inventory reservation included, since checkout calls this
 * before committing) — a coupon that turns out to be invalid at this final
 * moment must not silently let checkout proceed at full price.
 */
export class RedeemCouponUseCase {
  constructor(private readonly couponRepository: CouponRepositoryPort) {}

  async validateAndLock(input: ValidateAndLockCouponInput, tx: unknown): Promise<ValidateAndLockCouponResult> {
    const coupon = await this.couponRepository.lockForRedemption(input.code, tx);
    if (!coupon) {
      throw new NotFoundError("Coupon not found");
    }

    const [globalRedemptionCount, userRedemptionCount] = await Promise.all([
      this.couponRepository.countGlobalRedemptionsInTx(coupon.id, tx),
      this.couponRepository.countUserRedemptionsInTx(coupon.id, input.userId, tx),
    ]);

    const eligibility = resolveCouponEligibility(coupon, {
      now: new Date(),
      cartSubtotalPaise: input.cartSubtotalPaise,
      globalRedemptionCount,
      userRedemptionCount,
      lines: input.lines,
    });

    if (!eligibility.ok) {
      throw new UnprocessableEntityError(eligibility.reason ?? "This coupon can no longer be applied");
    }

    return {
      couponId: coupon.id,
      discountPaise: calculateCouponDiscount(coupon, eligibility.eligibleLineTotalPaise),
      eligibleLines: eligibility.eligibleLines,
    };
  }

  finalize(couponId: string, userId: string, orderId: string, tx: unknown): Promise<void> {
    return this.couponRepository.createRedemption(couponId, userId, orderId, tx);
  }
}
