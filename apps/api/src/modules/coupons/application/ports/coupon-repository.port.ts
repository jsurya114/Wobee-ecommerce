import type { CouponEntity, CouponType } from "../../domain/entities/coupon.entity";

/** Admin coupon management (2026-09-03) — CouponEntity plus how many times it's actually been redeemed, for the admin list/detail views. */
export interface AdminCouponEntity extends CouponEntity {
  redemptionCount: number;
}

export interface CreateCouponData {
  code: string;
  type: CouponType;
  value: number;
  minCartValuePaise: number | null;
  maxDiscountPaise: number | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  validFrom: Date;
  validTo: Date;
}

export type UpdateCouponData = Partial<CreateCouponData>;

/**
 * application depends on this interface, not on Prisma directly
 * (ARCHITECTURE.md §3.1).
 */
export interface CouponRepositoryPort {
  /** Plain, unlocked read — for cart's non-authoritative preview (ApplyCouponUseCase, GetCartUseCase's live redisplay). Never the redemption path. */
  findByCode(code: string): Promise<CouponEntity | null>;
  countGlobalRedemptions(couponId: string): Promise<number>;
  countUserRedemptions(couponId: string, userId: string): Promise<number>;

  /**
   * `SELECT ... FOR UPDATE` on the coupon row, inside the caller's checkout
   * transaction (`tx` — same opaque-handle pattern ADR-015's inventory
   * locking already uses) — the actual usageLimit/perUserLimit concurrency
   * guard (see CouponRedemption's own schema comment for why the unique
   * `orderId` constraint alone isn't enough). Returns null if the code
   * doesn't exist — never throws, callers map that to a clean error.
   */
  lockForRedemption(code: string, tx: unknown): Promise<CouponEntity | null>;
  /** Must run with the SAME `tx` a prior lockForRedemption call used, so the count reflects every redemption a concurrent transaction may have just committed and released the lock for. */
  countGlobalRedemptionsInTx(couponId: string, tx: unknown): Promise<number>;
  countUserRedemptionsInTx(couponId: string, userId: string, tx: unknown): Promise<number>;
  createRedemption(couponId: string, userId: string, orderId: string, tx: unknown): Promise<void>;

  // ── Admin coupon management (2026-09-03) ──
  findAllForAdmin(): Promise<AdminCouponEntity[]>;
  findByIdForAdmin(id: string): Promise<AdminCouponEntity | null>;
  createCoupon(data: CreateCouponData): Promise<AdminCouponEntity>;
  updateCoupon(id: string, data: UpdateCouponData): Promise<AdminCouponEntity>;
  setActive(id: string, isActive: boolean): Promise<AdminCouponEntity>;
  /** Caller (DeleteCouponUseCase) checks countGlobalRedemptions is 0 first — a coupon with real redemption history is never hard-deleted, only deactivated. */
  deleteCoupon(id: string): Promise<void>;
}
