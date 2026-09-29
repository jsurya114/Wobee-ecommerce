-- Data-only, one-off (2026-09-30): re-price the listing price caches of every
-- WEIGHT_BASED product against the CURRENT global rate. No schema change.
--
-- Changing the ₹/kg rate never refreshed `effectivePricePaiseCache` /
-- `minPricePaiseCache`, so listings (and the "Shop by Budget" maxPrice
-- filter) kept the rate each variant was last edited at. From this release
-- the admin rate change re-prices them (RefreshWeightBasedPriceCachesUseCase);
-- this brings the rows that are already stale in line once.
--
-- Same formula as @woobe/utils calculateWeightBasedPricePaise:
-- round(weightGrams * ratePerKgPaise / 1000), half away from zero (inputs
-- are non-negative, so identical to JS Math.round). The per-variant rate
-- override is deprecated and ignored by all pricing (resolve-effective-rate.ts),
-- so the default rate applies to every variant. The current rate is the
-- latest pricing_settings row already in effect, as PricingRepository reads it.
WITH current_rate AS (
  SELECT "defaultRatePerKgPaise" AS rate
  FROM "pricing_settings"
  WHERE "effectiveFrom" <= now()
  ORDER BY "effectiveFrom" DESC
  LIMIT 1
)
UPDATE "product_variants" v
SET "effectivePricePaiseCache" = ROUND((v."weightGrams"::numeric * current_rate.rate) / 1000)::integer
FROM "products" p, current_rate
WHERE p."id" = v."productId"
  AND p."pricingMode" = 'WEIGHT_BASED'
  AND v."effectivePricePaiseCache" <> ROUND((v."weightGrams"::numeric * current_rate.rate) / 1000)::integer;

-- Same rule as ProductRepository.recomputeMinPrice: the cheapest ACTIVE
-- variant's price, 0 when the product has none.
UPDATE "products" p
SET "minPricePaiseCache" = COALESCE(
  (SELECT MIN(v."effectivePricePaiseCache") FROM "product_variants" v WHERE v."productId" = p."id" AND v."isActive" = true),
  0
)
WHERE p."pricingMode" = 'WEIGHT_BASED';
