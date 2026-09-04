-- DropIndex
DROP INDEX "payments_orderId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "payments_orderId_key" ON "payments"("orderId");
