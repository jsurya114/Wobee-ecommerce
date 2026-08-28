-- Week 2 Day 5 (week2 (1).md §9-10). Purely additive.
--
-- NOTE: this migration's own `prisma migrate diff` output also proposed
-- `DROP INDEX "products_name_trgm_idx"` — the same recurring raw-SQL
-- pg_trgm gotcha documented in the Day 2 and Day 4 migrations' own journal
-- entries (the diff engine has no schema.prisma record of that
-- hand-written index). Manually removed before this file was written; this
-- migration does not touch the products table's indexes at all.
--
-- The `reviews.updatedAt` DROP DEFAULT below is unrelated to Day 5's own
-- changes — it reconciles drift this repo introduced itself in the Day 4
-- migration (which hand-added `DEFAULT CURRENT_TIMESTAMP` as a safety
-- margin beyond what Prisma's `@updatedAt` actually needs at the DB level).
-- Harmless: Prisma's client always sets this column explicitly on write,
-- it never depended on a database-level default.

-- AlterTable
ALTER TABLE "carts" ADD COLUMN     "couponCode" TEXT;

-- AlterTable
ALTER TABLE "reviews" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "shipping_rules" ADD COLUMN     "estimatedDeliveryDaysMax" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "estimatedDeliveryDaysMin" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "coupon_products" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "coupon_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_categories" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "coupon_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coupon_products_couponId_idx" ON "coupon_products"("couponId");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_products_couponId_productId_key" ON "coupon_products"("couponId", "productId");

-- CreateIndex
CREATE INDEX "coupon_categories_couponId_idx" ON "coupon_categories"("couponId");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_categories_couponId_categoryId_key" ON "coupon_categories"("couponId", "categoryId");

-- AddForeignKey
ALTER TABLE "coupon_products" ADD CONSTRAINT "coupon_products_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_products" ADD CONSTRAINT "coupon_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_categories" ADD CONSTRAINT "coupon_categories_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_categories" ADD CONSTRAINT "coupon_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
