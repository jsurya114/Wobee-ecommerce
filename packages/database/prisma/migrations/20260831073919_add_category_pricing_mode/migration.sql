-- CreateEnum
CREATE TYPE "PricingMode" AS ENUM ('WEIGHT_BASED', 'FIXED');

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "pricingMode" "PricingMode" NOT NULL DEFAULT 'WEIGHT_BASED';

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "pricingMode" "PricingMode" NOT NULL DEFAULT 'WEIGHT_BASED',
ALTER COLUMN "unitRatePerKgPaise" DROP NOT NULL;

-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "fixedPricePaise" INTEGER;
