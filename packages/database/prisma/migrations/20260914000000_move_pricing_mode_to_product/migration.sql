-- Move PricingMode from Category to Product (business requirement change,
-- 2026-09-14): pricing mode must be a PRODUCT attribute so admin can set it
-- per product independent of category ("Category describes WHAT a product
-- is; PricingMode describes HOW it's priced" — two different concepts), not
-- a hard rule "every product in this category is priced this way". See
-- Product.pricingMode's own doc comment in schema.prisma.
--
-- This backfills every existing product from its CURRENT category's
-- pricingMode before dropping the old column, so no product's effective
-- price changes at cutover (existing weight-based products stay
-- weight-based, existing fixed-price products stay fixed-price).

-- AlterTable: add the new column. Defaulted to WEIGHT_BASED only for the
-- brief window until the UPDATE below backfills every row from its category.
ALTER TABLE "products" ADD COLUMN "pricingMode" "PricingMode" NOT NULL DEFAULT 'WEIGHT_BASED';

-- Backfill: every product inherits its current category's pricingMode.
-- categoryId is a required FK, so this UPDATE reaches every row in "products".
UPDATE "products" p
SET "pricingMode" = c."pricingMode"
FROM "categories" c
WHERE p."categoryId" = c."id";

-- DropColumn: categories.pricingMode is superseded by products.pricingMode above.
ALTER TABLE "categories" DROP COLUMN "pricingMode";
