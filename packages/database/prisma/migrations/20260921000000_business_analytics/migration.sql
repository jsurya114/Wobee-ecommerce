-- CreateEnum
CREATE TYPE "AnalyticsEventType" AS ENUM ('SESSION_STARTED', 'PRODUCT_VIEWED', 'CART_ADDED', 'CHECKOUT_STARTED');

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "unitCostPaiseSnapshot" INTEGER;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "analyticsSessionId" TEXT;

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "costPricePaise" INTEGER;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "costPerKgPaise" INTEGER;

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" TEXT NOT NULL,
    "type" "AnalyticsEventType" NOT NULL,
    "sessionId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "productId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analytics_events_type_createdAt_idx" ON "analytics_events"("type", "createdAt");

-- CreateIndex
CREATE INDEX "analytics_events_createdAt_idx" ON "analytics_events"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_events_sessionId_type_dedupeKey_key" ON "analytics_events"("sessionId", "type", "dedupeKey");

-- CreateIndex
CREATE INDEX "carts_status_updatedAt_idx" ON "carts"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "order_items_variantId_idx" ON "order_items"("variantId");

-- CreateIndex
CREATE INDEX "orders_placedAt_idx" ON "orders"("placedAt");

-- CreateIndex
CREATE INDEX "orders_shippedAt_idx" ON "orders"("shippedAt");

-- CreateIndex
CREATE INDEX "orders_deliveredAt_idx" ON "orders"("deliveredAt");

-- CreateIndex
CREATE INDEX "orders_analyticsSessionId_idx" ON "orders"("analyticsSessionId");

-- CreateIndex
CREATE INDEX "webhook_events_eventType_createdAt_idx" ON "webhook_events"("eventType", "createdAt");

