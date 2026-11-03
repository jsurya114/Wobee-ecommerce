-- ============================================================================
-- Remove the demo catalogue from a Woobe database.
--
-- PREVIEW BY DEFAULT. Without `-v confirm=1` everything runs inside a
-- transaction that is ROLLED BACK at the end, so nothing changes. With
-- `-v confirm=1` the same statements run and are COMMITTED. Any error aborts
-- and rolls back the whole run (ON_ERROR_STOP), so it is all or nothing.
--
-- What counts as demo (nothing else is touched):
--   A. The 15 products `prisma/seed.ts` creates (fixed slug list below).
--   B. The presentation dataset from `demo-seed.ts` (PR #18): every row it
--      namespaces with `demo-` / `DEMO-` (products, variants, categories,
--      collections, coupons, orders `DEMO-ORD-*`, carts, addresses, webhook
--      and analytics events), its 4 offers (fixed UUIDs below) and its
--      @example.com CUSTOMER accounts. This mirrors `demo-reset.ts` on that
--      branch, which is not in the production image.
--      Pass `-v products_only=1` to skip the non-product part of B (demo
--      orders, customers, coupons, offers, events stay; demo products that
--      have demo orders are then archived instead of deleted).
--
-- Order history is never broken:
--   * A demo product whose variants appear on any order that is NOT itself
--     being deleted is ARCHIVED (product + variants inactive, stock 0,
--     removed from collections/coupons/offers/carts/wishlists) instead of
--     deleted, because order_items -> product_variants is ON DELETE RESTRICT.
--   * Every other demo product is hard deleted (images, variants, inventory,
--     collection/coupon/offer links and wishlist rows cascade).
--   * Cart lines pointing at removed variants are deleted from ANY cart.
--   * A coupon whose product/category restrictions all pointed at removed
--     rows is DEACTIVATED, because a coupon with no restriction rows applies
--     cart-wide (resolve-coupon-eligibility.ts). Same for a PRODUCTS-scope
--     offer left with no products.
--   * Base seed categories (tops, dresses, ...), the new-drops/most-loved
--     collections, the warehouse, pricing/GST/shipping rows, admin and staff
--     users and the base seed coupons are NOT touched.
--
-- Run with psql 16:  psql "$URL" -f remove-demo-products.sql            (preview)
--                    psql "$URL" -v confirm=1 -f remove-demo-products.sql (apply)
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off
\if :{?confirm}
\else
  \set confirm 0
\endif
\if :{?products_only}
\else
  \set products_only 0
\endif

BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- ---------------------------------------------------------------- targets ---
CREATE TEMP TABLE t_products ON COMMIT DROP AS
SELECT p.id, p.slug, p.name,
       CASE WHEN p.slug LIKE 'demo-%' THEN 'demo-seed (PR #18)' ELSE 'seed.ts' END AS source
FROM products p
WHERE p.slug LIKE 'demo-%'
   OR p.slug IN (
     'floral-wrap-dress', 'linen-coord-set', 'denim-jacket', 'silk-scarf',
     'cotton-kurta', 'pleated-midi-skirt', 'embroidered-top', 'palazzo-pants',
     'woven-tote-bag', 'statement-earrings', 'oxidised-jhumka-earrings',
     'quilted-crossbody-bag', 'kolhapuri-leather-sandals', 'enamel-bangle-set',
     'ribbed-knit-sweater');

CREATE TEMP TABLE t_variants ON COMMIT DROP AS
SELECT v.id, v."productId" FROM product_variants v
WHERE v."productId" IN (SELECT id FROM t_products) OR v.sku LIKE 'DEMO-%';

-- Demo orders / users / coupons / offers (part B). Empty when products_only=1.
CREATE TEMP TABLE t_orders ON COMMIT DROP AS
SELECT o.id, o."orderNumber" FROM orders o
WHERE o."orderNumber" LIKE 'DEMO-ORD-%' AND :products_only = 0;

CREATE TEMP TABLE t_users ON COMMIT DROP AS
SELECT u.id, u.email FROM users u
WHERE u.email LIKE '%@example.com' AND u.role = 'CUSTOMER' AND :products_only = 0;

CREATE TEMP TABLE t_coupons ON COMMIT DROP AS
SELECT c.id, c.code FROM coupons c
WHERE c.code LIKE 'DEMO-%' AND :products_only = 0;

CREATE TEMP TABLE t_offers ON COMMIT DROP AS
SELECT f.id, f.name FROM offers f
WHERE f.id IN ('f96a4493-7f2d-563f-abba-b69f65caf2e8', 'f5a2b132-b444-5dc4-baa8-bdfd9d263575',
               '3e9ff1b1-c3d5-50c6-8119-ac62d199e82f', 'e70bc6e1-0f98-5045-8526-736ae50e31d5')
  AND :products_only = 0;

-- Products with order history that survives this run -> archive, not delete.
CREATE TEMP TABLE t_archive ON COMMIT DROP AS
SELECT DISTINCT tv."productId" AS id
FROM order_items oi JOIN t_variants tv ON tv.id = oi."variantId"
WHERE oi."orderId" NOT IN (SELECT id FROM t_orders);

-- ---------------------------------------------------------------- preview ---
\echo
\echo '=== Demo products found (action: DELETE, or ARCHIVE when real orders reference them) ==='
SELECT tp.source, tp.slug, tp.name,
       CASE WHEN tp.id IN (SELECT id FROM t_archive) THEN 'ARCHIVE' ELSE 'DELETE' END AS action,
       (SELECT count(*) FROM product_variants v WHERE v."productId" = tp.id) AS variants,
       (SELECT count(*) FROM order_items oi JOIN product_variants v ON v.id = oi."variantId"
         WHERE v."productId" = tp.id AND oi."orderId" NOT IN (SELECT id FROM t_orders)) AS kept_order_lines
FROM t_products tp ORDER BY tp.source, tp.slug;

\echo '=== Products that STAY (check that nothing here is demo) ==='
SELECT p.slug, p.name, p."isActive", p."createdAt"::date AS created
FROM products p WHERE p.id NOT IN (SELECT id FROM t_products) ORDER BY p."createdAt";

\echo '=== Summary of rows affected ==='
SELECT 'products deleted' AS what, count(*) AS n FROM t_products WHERE id NOT IN (SELECT id FROM t_archive)
UNION ALL SELECT 'products archived', count(*) FROM t_archive
UNION ALL SELECT 'variants (deleted or archived)', count(*) FROM t_variants
UNION ALL SELECT 'cart lines removed', count(*) FROM cart_items WHERE "variantId" IN (SELECT id FROM t_variants)
UNION ALL SELECT 'wishlist rows removed', count(*) FROM wishlist_items WHERE "productId" IN (SELECT id FROM t_products)
UNION ALL SELECT 'demo orders deleted', count(*) FROM t_orders
UNION ALL SELECT 'demo customers deleted', count(*) FROM t_users
UNION ALL SELECT 'demo coupons deleted', count(*) FROM t_coupons
UNION ALL SELECT 'demo offers deleted', count(*) FROM t_offers
UNION ALL SELECT 'demo categories deleted', count(*) FROM categories c WHERE c.slug LIKE 'demo-%'
  AND NOT EXISTS (SELECT 1 FROM products p WHERE p."categoryId" = c.id AND p.id IN (SELECT id FROM t_archive))
  AND NOT EXISTS (SELECT 1 FROM products p WHERE p."categoryId" = c.id AND p.id NOT IN (SELECT id FROM t_products))
UNION ALL SELECT 'demo collections deleted', count(*) FROM collections WHERE slug LIKE 'demo-%' AND :products_only = 0;

\if :products_only
\echo '=== products_only: these demo offers/coupons stay ACTIVE (they can discount real products) ==='
SELECT 'offer' AS kind, name, "isActive" FROM offers WHERE id IN ('f96a4493-7f2d-563f-abba-b69f65caf2e8', 'f5a2b132-b444-5dc4-baa8-bdfd9d263575', '3e9ff1b1-c3d5-50c6-8119-ac62d199e82f', 'e70bc6e1-0f98-5045-8526-736ae50e31d5')
UNION ALL SELECT 'coupon', code, "isActive" FROM coupons WHERE code LIKE 'DEMO-%';
\endif

\echo '=== Demo customers that would be deleted ==='
SELECT email FROM t_users ORDER BY email;
\echo '=== Demo coupons / offers that would be deleted ==='
SELECT 'coupon' AS kind, code AS name FROM t_coupons UNION ALL SELECT 'offer', name FROM t_offers;

-- ------------------------------------------------------- part B: demo data ---
-- Children before parents, same order as demo-reset.ts.
DELETE FROM testimonials        WHERE "orderId" IN (SELECT id FROM t_orders) OR "customerId" IN (SELECT id FROM t_users);
DELETE FROM coupon_redemptions  WHERE "orderId" IN (SELECT id FROM t_orders) OR "couponId" IN (SELECT id FROM t_coupons);
DELETE FROM return_items        WHERE "returnId" IN (SELECT r.id FROM returns r WHERE r."orderId" IN (SELECT id FROM t_orders));
DELETE FROM refunds             WHERE "orderId" IN (SELECT id FROM t_orders);
DELETE FROM returns             WHERE "orderId" IN (SELECT id FROM t_orders);
DELETE FROM webhook_events      WHERE "eventId" LIKE 'demo-%' AND :products_only = 0;
DELETE FROM analytics_events    WHERE "sessionId" LIKE 'demo-session-%' AND :products_only = 0;
DELETE FROM carts               WHERE id LIKE 'demo-%' AND :products_only = 0;   -- cascades cart_items
UPDATE orders SET "exchangeOfOrderId" = NULL WHERE "exchangeOfOrderId" IN (SELECT id FROM t_orders) AND id NOT IN (SELECT id FROM t_orders);
DELETE FROM orders              WHERE id IN (SELECT id FROM t_orders);           -- cascades order_items, payments
DELETE FROM offers              WHERE id IN (SELECT id FROM t_offers);           -- cascades offer_products
DELETE FROM coupons             WHERE id IN (SELECT id FROM t_coupons);          -- cascades coupon_products/categories
DELETE FROM addresses           WHERE id LIKE 'demo-%' AND :products_only = 0;
DELETE FROM users               WHERE id IN (SELECT id FROM t_users);            -- cascades credentials, tokens, wishlist

-- -------------------------------------------------------- part A: products ---
-- Remember which coupons/offers had restrictions, to catch ones left empty.
CREATE TEMP TABLE t_restricted_coupons ON COMMIT DROP AS
SELECT "couponId" AS id FROM coupon_products UNION SELECT "couponId" FROM coupon_categories;
CREATE TEMP TABLE t_product_offers ON COMMIT DROP AS
SELECT id FROM offers WHERE scope = 'PRODUCTS';

DELETE FROM cart_items     WHERE "variantId" IN (SELECT id FROM t_variants);
DELETE FROM wishlist_items WHERE "productId" IN (SELECT id FROM t_products) OR "variantId" IN (SELECT id FROM t_variants);
DELETE FROM coupon_products     WHERE "productId" IN (SELECT id FROM t_products);
DELETE FROM offer_products      WHERE "productId" IN (SELECT id FROM t_products);
DELETE FROM product_collections WHERE "productId" IN (SELECT id FROM t_products);

-- Archive: keep the rows that order history points at, hide them everywhere.
UPDATE products         SET "isActive" = false, "updatedAt" = now() WHERE id IN (SELECT id FROM t_archive);
UPDATE product_variants SET "isActive" = false, "updatedAt" = now() WHERE "productId" IN (SELECT id FROM t_archive);
UPDATE inventory        SET "quantityAvailable" = 0, "updatedAt" = now()
 WHERE "variantId" IN (SELECT id FROM product_variants WHERE "productId" IN (SELECT id FROM t_archive));

-- Delete: products cascade images, variants (-> inventory), remaining links.
DELETE FROM products WHERE id IN (SELECT id FROM t_products) AND id NOT IN (SELECT id FROM t_archive);
DELETE FROM product_variants WHERE sku LIKE 'DEMO-%' AND "productId" NOT IN (SELECT id FROM t_archive);

-- Demo categories/collections, only when nothing else still uses them.
DELETE FROM collections WHERE slug LIKE 'demo-%' AND :products_only = 0;
DELETE FROM categories  c WHERE c.slug LIKE 'demo-%'
  AND NOT EXISTS (SELECT 1 FROM products p WHERE p."categoryId" = c.id);

-- A coupon/offer that lost every restriction would now apply store-wide.
\echo '=== Coupons / offers deactivated because their only targets were demo rows ==='
WITH c AS (
  UPDATE coupons SET "isActive" = false
  WHERE id IN (SELECT id FROM t_restricted_coupons) AND "isActive"
    AND NOT EXISTS (SELECT 1 FROM coupon_products cp WHERE cp."couponId" = coupons.id)
    AND NOT EXISTS (SELECT 1 FROM coupon_categories cc WHERE cc."couponId" = coupons.id)
  RETURNING 'coupon'::text AS kind, code AS name),
o AS (
  UPDATE offers SET "isActive" = false, "updatedAt" = now()
  WHERE id IN (SELECT id FROM t_product_offers) AND "isActive"
    AND NOT EXISTS (SELECT 1 FROM offer_products op WHERE op."offerId" = offers.id)
  RETURNING 'offer'::text AS kind, name)
SELECT * FROM c UNION ALL SELECT * FROM o;

-- ------------------------------------------------------------ after state ---
\echo '=== After this run ==='
SELECT (SELECT count(*) FROM products) AS products_total,
       (SELECT count(*) FROM products WHERE "isActive") AS products_active,
       (SELECT count(*) FROM products WHERE slug LIKE 'demo-%' AND "isActive") AS demo_active_left,
       (SELECT count(*) FROM orders) AS orders_total,
       (SELECT count(*) FROM order_items oi LEFT JOIN product_variants v ON v.id = oi."variantId" WHERE v.id IS NULL) AS orphan_order_lines;

\if :confirm
  COMMIT;
  \echo 'COMMITTED. Demo catalogue removed.'
\else
  ROLLBACK;
  \echo 'PREVIEW ONLY: rolled back, nothing was changed. Re-run with -v confirm=1 to apply.'
\endif
