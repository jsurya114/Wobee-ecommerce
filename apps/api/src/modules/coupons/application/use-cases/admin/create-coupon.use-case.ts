import type { CreateCouponInput as CreateCouponRequest } from "@woobe/validation";
import { ValidationError } from "../../../../../shared/errors";
import { validateCouponInput } from "../../../domain/validate-coupon-input";
import type { AdminCouponEntity, CouponRepositoryPort } from "../../ports/coupon-repository.port";

export class CreateCouponUseCase {
  constructor(private readonly couponRepository: CouponRepositoryPort) {}

  async execute(input: CreateCouponRequest): Promise<AdminCouponEntity> {
    const data = {
      code: input.code,
      type: input.type,
      value: input.value,
      minCartValuePaise: input.minCartValuePaise ?? null,
      maxDiscountPaise: input.maxDiscountPaise ?? null,
      usageLimit: input.usageLimit ?? null,
      perUserLimit: input.perUserLimit ?? null,
      validFrom: input.validFrom,
      validTo: input.validTo,
    };

    const error = validateCouponInput(data);
    if (error) {
      throw new ValidationError(error);
    }

    return this.couponRepository.createCoupon(data);
  }
}
