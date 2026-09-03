import type { UpdateCouponInput as UpdateCouponRequest } from "@woobe/validation";
import { NotFoundError, ValidationError } from "../../../../../shared/errors";
import { validateCouponInput } from "../../../domain/validate-coupon-input";
import type { AdminCouponEntity, CouponRepositoryPort, UpdateCouponData } from "../../ports/coupon-repository.port";

/**
 * Validates against the FINAL, merged shape (existing row + this patch),
 * not just whatever fields happened to be in this one request — see
 * validateCouponInput's own doc comment for why (a patch that only sends
 * `perUserLimit` must still be checked against the coupon's existing
 * `usageLimit`, not skip that rule just because usageLimit wasn't resent).
 */
export class UpdateCouponUseCase {
  constructor(private readonly couponRepository: CouponRepositoryPort) {}

  async execute(id: string, input: UpdateCouponRequest): Promise<AdminCouponEntity> {
    const existing = await this.couponRepository.findByIdForAdmin(id);
    if (!existing) {
      throw new NotFoundError("Coupon not found");
    }

    const patch: UpdateCouponData = {
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.value !== undefined ? { value: input.value } : {}),
      ...(input.minCartValuePaise !== undefined ? { minCartValuePaise: input.minCartValuePaise } : {}),
      ...(input.maxDiscountPaise !== undefined ? { maxDiscountPaise: input.maxDiscountPaise } : {}),
      ...(input.usageLimit !== undefined ? { usageLimit: input.usageLimit } : {}),
      ...(input.perUserLimit !== undefined ? { perUserLimit: input.perUserLimit } : {}),
      ...(input.validFrom !== undefined ? { validFrom: input.validFrom } : {}),
      ...(input.validTo !== undefined ? { validTo: input.validTo } : {}),
    };

    const merged = {
      type: patch.type ?? existing.type,
      value: patch.value ?? existing.value,
      validFrom: patch.validFrom ?? existing.validFrom,
      validTo: patch.validTo ?? existing.validTo,
      usageLimit: "usageLimit" in patch ? patch.usageLimit! : existing.usageLimit,
      perUserLimit: "perUserLimit" in patch ? patch.perUserLimit! : existing.perUserLimit,
      maxDiscountPaise: "maxDiscountPaise" in patch ? patch.maxDiscountPaise! : existing.maxDiscountPaise,
    };

    const error = validateCouponInput(merged);
    if (error) {
      throw new ValidationError(error);
    }

    return this.couponRepository.updateCoupon(id, patch);
  }
}
