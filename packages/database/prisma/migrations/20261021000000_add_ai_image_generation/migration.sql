-- CreateEnum
CREATE TYPE "AiImageAngle" AS ENUM ('FRONT', 'BACK', 'SIDE', 'DETAIL');

-- CreateEnum
CREATE TYPE "AiGeneratedImageStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "ai_image_generations" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sourceMediaId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_image_generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_generated_images" (
    "id" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "angle" "AiImageAngle" NOT NULL,
    "status" "AiGeneratedImageStatus" NOT NULL DEFAULT 'PENDING',
    "mediaId" TEXT,
    "providerPredictionId" TEXT,
    "creditsUsed" INTEGER,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_generated_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_image_generations_productId_createdAt_idx" ON "ai_image_generations"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_generated_images_generationId_idx" ON "ai_generated_images"("generationId");

-- CreateIndex
CREATE INDEX "ai_generated_images_status_updatedAt_idx" ON "ai_generated_images"("status", "updatedAt");

-- AddForeignKey
ALTER TABLE "ai_image_generations" ADD CONSTRAINT "ai_image_generations_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_image_generations" ADD CONSTRAINT "ai_image_generations_sourceMediaId_fkey" FOREIGN KEY ("sourceMediaId") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_image_generations" ADD CONSTRAINT "ai_image_generations_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generated_images" ADD CONSTRAINT "ai_generated_images_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "ai_image_generations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generated_images" ADD CONSTRAINT "ai_generated_images_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

