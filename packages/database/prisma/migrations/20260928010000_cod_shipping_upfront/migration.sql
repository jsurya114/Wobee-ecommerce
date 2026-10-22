-- AlterTable
ALTER TABLE "app_config" ADD COLUMN     "codShippingUpfront" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "payableOnDeliveryPaise" INTEGER,
ADD COLUMN     "shippingPaidUpfront" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "upfrontAmountPaise" INTEGER;

