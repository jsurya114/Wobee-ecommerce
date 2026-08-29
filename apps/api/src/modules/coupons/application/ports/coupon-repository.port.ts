import type { CouponEntity } from "../../domain/entities/coupon.entity";

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
}
