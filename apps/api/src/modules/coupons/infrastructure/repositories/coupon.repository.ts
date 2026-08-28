import { Prisma, prisma } from "@woobe/database";
import type { CouponRepositoryPort } from "../../application/ports/coupon-repository.port";
import type { CouponEntity, CouponType } from "../../domain/entities/coupon.entity";

type PrismaTx = Prisma.TransactionClient;

const COUPON_SELECT = {
  id: true,
  code: true,
  type: true,
  value: true,
  minCartValuePaise: true,
  maxDiscountPaise: true,
  usageLimit: true,
  perUserLimit: true,
  validFrom: true,
  validTo: true,
  isActive: true,
  products: { select: { productId: true } },
  categories: { select: { categoryId: true } },
} as const;

type CouponRow = Prisma.CouponGetPayload<{ select: typeof COUPON_SELECT }>;

/**
 * ADR-010: the ONLY file in the coupons module allowed to import
 * @woobe/database (enforced by apps/api/.dependency-cruiser.cjs).
 */
export class CouponRepository implements CouponRepositoryPort {
  async findByCode(code: string): Promise<CouponEntity | null> {
    const row = await prisma.coupon.findUnique({ where: { code }, select: COUPON_SELECT });
    return row ? toEntity(row) : null;
  }

  async countGlobalRedemptions(couponId: string): Promise<number> {
    return prisma.couponRedemption.count({ where: { couponId } });
  }

  async countUserRedemptions(couponId: string, userId: string): Promise<number> {
    return prisma.couponRedemption.count({ where: { couponId, userId } });
  }

  async lockForRedemption(code: string, tx: unknown): Promise<CouponEntity | null> {
    const client = tx as PrismaTx;
    // Raw SQL: Prisma has no query-builder API for row locks (same reason
    // inventory's own lockRowsForVariants is raw SQL, ADR-015). Locked by
    // the unique `code` column directly — checkout only ever has the code
    // string (Cart.couponCode), never the id, at the point it needs to lock.
    const rows = await client.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "coupons" WHERE "code" = ${code} FOR UPDATE
    `;
    const locked = rows[0];
    if (!locked) {
      return null;
    }
    // The lock above only holds the coupons row itself — CouponProduct/
    // CouponCategory rows are eligibility criteria, never mutated during
    // redemption, so reading them (still via the same tx client, for a
    // consistent snapshot) needs no lock of their own.
    const row = await client.coupon.findUniqueOrThrow({ where: { id: locked.id }, select: COUPON_SELECT });
    return toEntity(row);
  }

  async countGlobalRedemptionsInTx(couponId: string, tx: unknown): Promise<number> {
    return (tx as PrismaTx).couponRedemption.count({ where: { couponId } });
  }

  async countUserRedemptionsInTx(couponId: string, userId: string, tx: unknown): Promise<number> {
    return (tx as PrismaTx).couponRedemption.count({ where: { couponId, userId } });
  }

  async createRedemption(couponId: string, userId: string, orderId: string, tx: unknown): Promise<void> {
    await (tx as PrismaTx).couponRedemption.create({ data: { couponId, userId, orderId } });
  }
}

function toEntity(row: CouponRow): CouponEntity {
  return {
    id: row.id,
    code: row.code,
    type: row.type as CouponType,
    value: row.value,
    minCartValuePaise: row.minCartValuePaise,
    maxDiscountPaise: row.maxDiscountPaise,
    usageLimit: row.usageLimit,
    perUserLimit: row.perUserLimit,
    validFrom: row.validFrom,
    validTo: row.validTo,
    isActive: row.isActive,
    productIds: row.products.map((p) => p.productId),
    categoryIds: row.categories.map((c) => c.categoryId),
  };
}
