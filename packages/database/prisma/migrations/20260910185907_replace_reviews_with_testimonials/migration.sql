-- accept-data-loss: intentional, per the feature this migration ships (see the commit "feat: replace product reviews with store-level testimonials" and this migration's own name) — per-product reviews are retired in favor of store-level testimonials (Testimonial/TestimonialImage below), not an accidental drop. Verified the `reviews` table held 0 rows in this environment's dev database (`woobe_dev`) before applying.
/*
  Warnings:

  - You are about to drop the `reviews` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "TestimonialStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- DropForeignKey
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_productId_fkey";

-- DropForeignKey
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_userId_fkey";

-- DropTable
DROP TABLE "reviews";

-- DropEnum
DROP TYPE "ReviewStatus";

-- CreateTable
CREATE TABLE "testimonials" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "status" "TestimonialStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "testimonials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "testimonial_images" (
    "id" TEXT NOT NULL,
    "testimonialId" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,

    CONSTRAINT "testimonial_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "testimonials_orderId_key" ON "testimonials"("orderId");

-- CreateIndex
CREATE INDEX "testimonials_status_idx" ON "testimonials"("status");

-- CreateIndex
CREATE INDEX "testimonials_customerId_idx" ON "testimonials"("customerId");

-- CreateIndex
CREATE INDEX "testimonial_images_testimonialId_idx" ON "testimonial_images"("testimonialId");

-- AddForeignKey
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testimonial_images" ADD CONSTRAINT "testimonial_images_testimonialId_fkey" FOREIGN KEY ("testimonialId") REFERENCES "testimonials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testimonial_images" ADD CONSTRAINT "testimonial_images_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint: rating must be 1-5 — Prisma has no first-class range-constraint
-- syntax at this version (same situation as pg_trgm's own raw-SQL addition
-- alongside a Prisma-declared model, see Product.name's GIN index migration).
-- Defense in depth alongside the API's own zod validation — the database is
-- the authoritative invariant, not just application code.
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_rating_range" CHECK ("rating" >= 1 AND "rating" <= 5);
