-- Week 2 independent-review fixes (additive only).
--
-- P0: OrderItem.discountPaise — snapshot the coupon discount allocated to each
--     order line at checkout, so returns/refunds refund what was actually paid
--     for the goods, not the undiscounted unitPricePaise * quantity.
-- P1: NotificationStatus.SENDING — an atomic in-flight claim state taken before
--     the provider send, so a BullMQ redelivery / worker crash can't double-send.
--
-- Both are purely additive (ADD VALUE / ADD COLUMN with a default) — no data loss.

-- AlterEnum
--   Placed BEFORE 'SENT' so the physical enum order matches schema.prisma's
--   declared order (PENDING, SENDING, SENT, FAILED) — keeps `migrate diff` clean.
ALTER TYPE "NotificationStatus" ADD VALUE 'SENDING' BEFORE 'SENT';

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "discountPaise" INTEGER NOT NULL DEFAULT 0;
