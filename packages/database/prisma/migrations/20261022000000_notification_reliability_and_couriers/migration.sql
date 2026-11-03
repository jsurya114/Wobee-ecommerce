-- Additive only.
ALTER TABLE "notifications" ADD COLUMN "dedupeKey" TEXT;
ALTER TABLE "notifications" ADD COLUMN "claimedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "notifications_dedupeKey_key" ON "notifications"("dedupeKey");
CREATE INDEX "notifications_status_createdAt_idx" ON "notifications"("status", "createdAt");

ALTER TABLE "orders" ADD COLUMN "carrierCode" TEXT;
ALTER TABLE "orders" ADD COLUMN "trackingUrl" TEXT;
