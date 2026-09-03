import type { AdminCouponEntity, CouponRepositoryPort } from "../../ports/coupon-repository.port";

export class ListCouponsAdminUseCase {
  constructor(private readonly couponRepository: CouponRepositoryPort) {}

  execute(): Promise<AdminCouponEntity[]> {
    return this.couponRepository.findAllForAdmin();
  }
}
