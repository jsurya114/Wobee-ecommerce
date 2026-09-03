import type { AdminCouponEntity, CouponRepositoryPort } from "../../ports/coupon-repository.port";

export class SetCouponActiveUseCase {
  constructor(private readonly couponRepository: CouponRepositoryPort) {}

  execute(id: string, isActive: boolean): Promise<AdminCouponEntity> {
    return this.couponRepository.setActive(id, isActive);
  }
}
