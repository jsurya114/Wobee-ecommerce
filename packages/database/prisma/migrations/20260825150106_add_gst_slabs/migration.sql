-- CreateTable
CREATE TABLE "gst_slabs" (
    "id" TEXT NOT NULL,
    "maxPricePaise" INTEGER,
    "ratePercent" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gst_slabs_pkey" PRIMARY KEY ("id")
);
