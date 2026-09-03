import { ConflictError, NotFoundError } from "../../../../../shared/errors";
import type { CouponRepositoryPort } from "../../ports/coupon-repository.port";

/**
 * A coupon that has ever been redeemed is never hard-deleted — its
 * `CouponRedemption` rows are real order/discount history (and the DB's
 * own FK from CouponRedemption.couponId would reject the delete anyway;
 * this check gives a clear, intentional error instead of a raw constraint
 * failure). Deactivate (SetCouponActiveUseCase) is the correct action for
 * a coupon with usage history — this use-case only removes one that was
 * created and never actually used.
 */
export class DeleteCouponUseCase {
  constructor(private readonly couponRepository: CouponRepositoryPort) {}

  async execute(id: string): Promise<void> {
    const coupon = await this.couponRepository.findByIdForAdmin(id);
    if (!coupon) {
      throw new NotFoundError("Coupon not found");
    }
    if (coupon.redemptionCount > 0) {
      throw new ConflictError("This coupon has already been used and can't be deleted — deactivate it instead");
    }
    await this.couponRepository.deleteCoupon(id);
  }
}
