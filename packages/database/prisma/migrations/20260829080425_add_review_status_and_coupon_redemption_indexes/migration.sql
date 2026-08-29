-- Week 2 Day 9 (week2 (1).md §21) — two justified index additions, see the
-- schema.prisma comments on CouponRedemption.@@index and Review.@@index for
-- the real query paths each one serves.
--
-- Written by hand rather than via `prisma migrate dev`'s own diff: this
-- schema also carries a raw-SQL GIN trigram index on products.name
-- (migration 20260827092111_add_catalogue_search_indexes, ADR-012) that
-- Prisma's schema DSL can't declare, so `migrate dev`'s diff always sees it
-- as undeclared drift and tries to DROP INDEX "products_name_trgm_idx" on
-- every future migration it generates — confirmed by generating one and
-- catching it before it reached a shared database. Hand-writing avoids that
-- false-positive drop; a future raw-SQL-index-aware Prisma migration can
-- fold this workaround away.

-- CreateIndex
CREATE INDEX "coupon_redemptions_couponId_userId_idx" ON "coupon_redemptions"("couponId", "userId");

-- CreateIndex
CREATE INDEX "reviews_status_idx" ON "reviews"("status");
