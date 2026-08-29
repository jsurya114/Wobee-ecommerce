-- accept-data-loss: dropping reviews.isApproved (Boolean) in favor of the
-- new reviews.status enum (PENDING/APPROVED/REJECTED/HIDDEN) — no production
-- review data exists yet (Week 1 never built the reviews feature, seed.ts
-- never wrote to this table), so there is nothing to lose. See journal.md,
-- Week 2 Day 4.
--
-- NOTE: this migration's own `prisma migrate diff` output also proposed
-- `DROP INDEX "products_name_trgm_idx"` — the Week 2 Day 1 raw-SQL pg_trgm
-- index the diff engine has no schema.prisma record of (same gotcha
-- documented in the Day 2 collections migration's own journal entry).
-- Manually removed before this file was written; this migration does not
-- touch the products table at all.

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('ACTIVE', 'DELETED');

-- AlterTable
ALTER TABLE "reviews" DROP COLUMN "isApproved",
ADD COLUMN     "isVerifiedPurchase" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "media" (
    "id" TEXT NOT NULL,
    "type" "MediaType" NOT NULL,
    "key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "altText" TEXT,
    "status" "MediaStatus" NOT NULL DEFAULT 'ACTIVE',
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_key_key" ON "media"("key");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_productId_userId_key" ON "reviews"("productId", "userId");

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
