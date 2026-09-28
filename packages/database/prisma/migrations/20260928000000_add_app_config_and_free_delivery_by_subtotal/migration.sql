-- AlterTable
ALTER TABLE "shipping_rules" ADD COLUMN     "freeDeliveryMinSubtotalPaise" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "app_config" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "minCartQuantity" INTEGER NOT NULL DEFAULT 1,
    "presetSizes" TEXT NOT NULL DEFAULT 'XS,S,M,L,XL,XXL,3XL,Free Size',
    "presetFabrics" TEXT NOT NULL DEFAULT 'Cotton,Silk,Linen,Polyester,Rayon,Georgette,Chiffon,Crepe,Velvet',
    "presetFits" TEXT NOT NULL DEFAULT 'Regular,Slim,Relaxed,Oversized,A-Line',
    "returnsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_config_pkey" PRIMARY KEY ("id")
);

