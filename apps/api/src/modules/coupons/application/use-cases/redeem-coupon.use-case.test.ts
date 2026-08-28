import { describe, expect, it, vi } from "vitest";
import { RedeemCouponUseCase } from "./redeem-coupon.use-case";
import type { CouponRepositoryPort } from "../ports/coupon-repository.port";
import type { CouponEntity } from "../../domain/entities/coupon.entity";

function coupon(overrides: Partial<CouponEntity> = {}): CouponEntity {
  return {
    id: "coupon-1",
    code: "SAVE10",
    type: "PERCENTAGE",
    value: 10,
    minCartValuePaise: null,
    maxDiscountPaise: null,
    usageLimit: null,
    perUserLimit: null,
    validFrom: new Date("2026-01-01"),
    validTo: new Date("2026-12-31"),
    isActive: true,
    productIds: [],
    categoryIds: [],
    ...overrides,
  };
}

const input = {
  code: "SAVE10",
  userId: "user-1",
  cartSubtotalPaise: 10_000,
  lines: [{ variantId: "v1", productId: "p1", categoryId: "c1", lineTotalPaise: 10_000 }],
};

describe("RedeemCouponUseCase.validateAndLock", () => {
  it("locks the coupon, re-validates live, and returns the discount without creating a redemption yet", async () => {
    const couponRepository = {
      lockForRedemption: vi.fn().mockResolvedValue(coupon()),
      countGlobalRedemptionsInTx: vi.fn().mockResolvedValue(0),
      countUserRedemptionsInTx: vi.fn().mockResolvedValue(0),
      createRedemption: vi.fn(),
    } as unknown as CouponRepositoryPort;
    const useCase = new RedeemCouponUseCase(couponRepository);

    const result = await useCase.validateAndLock(input, "tx");

    expect(couponRepository.lockForRedemption).toHaveBeenCalledWith("SAVE10", "tx");
    expect(result.couponId).toBe("coupon-1");
    expect(result.discountPaise).toBe(1000); // 10% of 10,000
    expect(couponRepository.createRedemption).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the code doesn't exist", async () => {
    const couponRepository = { lockForRedemption: vi.fn().mockResolvedValue(null) } as unknown as CouponRepositoryPort;
    const useCase = new RedeemCouponUseCase(couponRepository);

    await expect(useCase.validateAndLock(input, "tx")).rejects.toThrow("Coupon not found");
  });

  it("rejects (rolling back the whole checkout transaction) once the usage limit is exhausted, even though the coupon itself is otherwise valid", async () => {
    const couponRepository = {
      lockForRedemption: vi.fn().mockResolvedValue(coupon({ usageLimit: 1 })),
      countGlobalRedemptionsInTx: vi.fn().mockResolvedValue(1), // already used up, by another transaction that held this same lock first
      countUserRedemptionsInTx: vi.fn().mockResolvedValue(0),
    } as unknown as CouponRepositoryPort;
    const useCase = new RedeemCouponUseCase(couponRepository);

    await expect(useCase.validateAndLock(input, "tx")).rejects.toThrow(/usage limit/i);
  });
});

describe("RedeemCouponUseCase.finalize", () => {
  it("creates the redemption row with the given ids", async () => {
    const couponRepository = { createRedemption: vi.fn().mockResolvedValue(undefined) } as unknown as CouponRepositoryPort;
    const useCase = new RedeemCouponUseCase(couponRepository);

    await useCase.finalize("coupon-1", "user-1", "order-1", "tx");

    expect(couponRepository.createRedemption).toHaveBeenCalledWith("coupon-1", "user-1", "order-1", "tx");
  });
});
