-- Phase 2 (2026-09-14): Offer domain (automatic promotional pricing,
-- deliberately separate from Coupon — see Offer's own doc comment in
-- schema.prisma) plus the OrderItem snapshot columns that let a historical
-- order keep showing the actual offer/discount applied at checkout even
-- after the offer later changes or expires.

-- CreateEnum
CREATE TYPE "OfferDiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "OfferScope" AS ENUM ('ALL_PRODUCTS', 'CATEGORY', 'PRODUCTS');

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "basePricePaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "offerDiscountPaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "offerDiscountType" "OfferDiscountType",
ADD COLUMN     "offerDiscountValue" INTEGER,
ADD COLUMN     "offerId" TEXT,
ADD COLUMN     "offerNameSnapshot" TEXT;

-- Backfill: no Offer existed before this migration, so every existing
-- OrderItem's base (pre-offer) price is simply its own unitPricePaise —
-- offerDiscountPaise stays 0 (its DB default above), offer* snapshot
-- columns stay null. This preserves every historical order's price exactly
-- as it already was.
UPDATE "order_items" SET "basePricePaise" = "unitPricePaise";

-- CreateTable
CREATE TABLE "offers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "discountType" "OfferDiscountType" NOT NULL,
    "discountValue" INTEGER NOT NULL,
    "scope" "OfferScope" NOT NULL,
    "categoryId" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer_products" (
    "offerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "offer_products_pkey" PRIMARY KEY ("offerId","productId")
);

-- CreateIndex
CREATE INDEX "offers_isActive_startsAt_endsAt_idx" ON "offers"("isActive", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "offers_categoryId_idx" ON "offers"("categoryId");

-- CreateIndex
CREATE INDEX "offer_products_productId_idx" ON "offer_products"("productId");

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_products" ADD CONSTRAINT "offer_products_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_products" ADD CONSTRAINT "offer_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
