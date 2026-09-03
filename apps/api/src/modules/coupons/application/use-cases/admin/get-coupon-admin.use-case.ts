import { NotFoundError } from "../../../../../shared/errors";
import type { AdminCouponEntity, CouponRepositoryPort } from "../../ports/coupon-repository.port";

export class GetCouponAdminUseCase {
  constructor(private readonly couponRepository: CouponRepositoryPort) {}

  async execute(id: string): Promise<AdminCouponEntity> {
    const coupon = await this.couponRepository.findByIdForAdmin(id);
    if (!coupon) {
      throw new NotFoundError("Coupon not found");
    }
    return coupon;
  }
}
