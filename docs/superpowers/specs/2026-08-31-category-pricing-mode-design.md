# Category-Level Fixed Pricing + Smart-Cart Exclusion — Design Spec

**Status:** Approved for implementation
**Date:** 2026-08-31
**Author:** Claude Code, with Jasil

## 1. Context & Goal

Client-reported business logic issue: weight-based pricing (`price = weightGrams
× ₹/kg`) is only correct for clothing (Tops, Dresses, Bottoms, Ethnic Wear).
Accessories (scarves, bags, earrings, bangles, sandals) must have a **fixed**
admin-set price — weight has nothing to do with what a pair of earrings costs.

Additionally: the cart's "smart cart" weight-threshold mechanic (1,000g
minimum to unlock checkout, 1,500g for free delivery — `ADR-021`) was built
assuming every item is weight-priced. It must not apply to fixed-price
products: a shopper buying one pair of earrings should never be blocked from
checkout for being "underweight."

Decision (confirmed with the user): pricing mode is a **hard rule keyed by
category**, not a per-product override. `Category.pricingMode` is
admin-configurable data (same pattern as `GstSlab`/`PricingSetting`/
`ShippingRule`), not a hardcoded slug list — but there is no per-product
exception path.

## 2. Explicitly In Scope

- `Category.pricingMode: WEIGHT_BASED | FIXED`, seeded: Tops/Dresses/Bottoms/
  Ethnic Wear → `WEIGHT_BASED`, Accessories → `FIXED`.
- `ProductVariant.fixedPricePaise: Int?` — authoritative price for variants
  whose product's category is `FIXED`.
- `CalculateEffectivePriceUseCase` branches on the variant's category
  `pricingMode` — the one choke point every price already flows through.
- `OrderItem` snapshots `pricingMode` + nullable `unitRatePerKgPaise`, so
  historical orders stay correct even if a category's mode is ever changed.
- Cart/shipping: the 1,000g/1,500g thresholds are evaluated against the
  cart's **weight-based-items-only** weight, not total physical weight. A
  cart with zero weight-based items bypasses the minimum-checkout gate
  entirely (never blocked) and is not eligible for the free-delivery
  threshold either (falls to the standard flat fee, same band as a
  1,000–1,499g weight-based cart today — no new fee tier invented).
- `totalWeightGrams` (physical, all items) is unchanged and still shown/used
  for the actual shipping weight — only the *threshold evaluation* input
  changes, not the physical weight itself.
- Admin `VariantForm`: shows "Rate/kg override" for weight-based products'
  variants, "Fixed price" for fixed-price products' variants.
- Storefront display: no new logic needed — `PriceTag` already omits the
  weight/rate line when `ratePerKgPaise` is absent; `WeightThresholdBanner`
  gets one added state (no weight-based items in cart → banner doesn't
  render a "meet the minimum" prompt).
- Backfill migration: existing Accessories products get
  `fixedPricePaise = effectivePricePaiseCache` (no visible price change at
  cutover); admin adjusts to real fixed prices afterward.

## 3. Explicitly Out of Scope

- Per-product override of a category's pricing mode (confirmed: hard rule,
  category is authoritative, no exception path).
- Admin UI for managing categories (creating/editing `Category` rows,
  including `pricingMode`) — no such UI exists today; this ships via
  migration + seed only, same as the rest of the category table currently.
- Any change to GST, coupon/discount, or return/refund calculation logic —
  all of those already operate on the final resolved `pricePaise` regardless
  of how it was derived; nothing there changes.
- Any change to how physical shipping weight (`totalWeightGrams`) is
  computed, stored, or shown — only which weight number gates the
  checkout/free-delivery *thresholds* changes.

## 4. Data Model

```prisma
enum PricingMode {
  WEIGHT_BASED
  FIXED
}

model Category {
  // ...existing fields...
  pricingMode PricingMode @default(WEIGHT_BASED)
}

model ProductVariant {
  // ...existing fields...
  fixedPricePaise Int?  // authoritative only when the product's category is FIXED
}

model OrderItem {
  // ...existing fields...
  pricingMode        PricingMode
  unitRatePerKgPaise Int?         // was Int (required); now null for FIXED lines
}
```

Migration is additive: new enum, `Category.pricingMode` defaults to
`WEIGHT_BASED` (no existing row changes meaning), `fixedPricePaise` nullable,
`OrderItem.pricingMode` backfilled `WEIGHT_BASED` for all existing rows
(accurate — nothing was fixed-price before this change),
`unitRatePerKgPaise` relaxed to nullable.

Seed data: `categoryDefs` gets `pricingMode: "FIXED"` on the Accessories row
only. Every Accessories `productDefs` variant gets `fixedPricePaise` set to
its current weight-derived price (computed once at seed time via the
existing `priceForWeight` helper, then frozen as a literal), so seeded demo
data doesn't visibly change price at cutover.

## 5. Pricing Engine

`CalculateEffectivePriceUseCase.execute` input gains `pricingMode` and
`fixedPricePaise` (alongside the existing `weightGrams`/
`ratePerKgOverridePaise`):

```ts
async execute(input: {
  pricingMode: PricingMode;
  weightGrams: number;
  ratePerKgOverridePaise: number | null;
  fixedPricePaise: number | null;
}): Promise<EffectivePrice> // EffectivePrice.ratePerKgPaise becomes `number | null`
```

- `WEIGHT_BASED`: unchanged existing math.
- `FIXED`: `pricePaise = fixedPricePaise` (throw a domain error if null — a
  fixed-price variant with no price set is a data-entry defect, must fail
  loudly, never silently default to 0 or fall back to weight math).

Every caller (product listing/detail projections, cart line pricing,
checkout) already loads the variant's product/category — this only adds two
already-available fields to the same call, no new query.

## 6. Cart / Shipping Threshold Exclusion

`computeCartTotals` gains a second total:

```ts
export interface CartLineForTotals {
  quantity: number;
  unitPricePaise: number;
  weightGrams: number;
  pricingMode: PricingMode; // new
}

export interface CartTotals {
  itemCount: number;
  totalWeightGrams: number;       // unchanged: physical weight, all items
  weightBasedTotalGrams: number;  // new: physical weight of WEIGHT_BASED lines only
  totalPaise: number;
}
```

`resolveShippingEvaluation` takes `weightBasedTotalGrams` instead of the
cart's full `totalWeightGrams`, and gains the bypass rule:

```ts
export function resolveShippingEvaluation(weightBasedTotalGrams: number, rule: ShippingRuleValues): ShippingEvaluation {
  const hasWeightBasedItems = weightBasedTotalGrams > 0;
  const meetsMinimum = !hasWeightBasedItems || weightBasedTotalGrams >= rule.minWeightGramsForCheckout;
  const isFreeDelivery = hasWeightBasedItems && weightBasedTotalGrams >= rule.freeDeliveryThresholdGrams;
  // shippingFeePaise / gramsToMinimum / gramsToFreeDelivery derive from these two exactly as today
}
```

A cart containing only fixed-price items: `meetsMinimum = true` (never
blocked), `isFreeDelivery = false` (no free-shipping perk invented — it
never reaches the threshold), `shippingFeePaise = standardFeePaise` — same
flat fee a 1,000–1,499g weight-based cart pays today, not a new tier.

An empty cart is unaffected — cart emptiness is already guarded elsewhere
before this evaluation runs.

`GetCartUseCase` / `CheckoutUseCase` pass `weightBasedTotalGrams` (not
`totalWeightGrams`) into `EvaluateShippingUseCase.execute(...)`. The cart
response still returns `totalWeightGrams` unchanged for the "Total weight"
line the customer sees.

## 7. Storefront

- `WeightThresholdBanner`: when the cart has zero weight-based items, it
  renders nothing (there is no threshold to show progress toward) rather
  than a permanently-stuck "add 1000g" prompt. This is the one new UI
  branch; everything else in that component is unchanged.
- `PriceTag`/`ProductCard`/PDP: no code change — `ratePerKgPaise` already
  flows through as `number | undefined`/`null` and the weight/rate line is
  already conditionally rendered on its presence.

## 8. Admin

- `VariantForm`: the field currently labeled "Rate/kg override (paise,
  optional)" is replaced with "Fixed price (paise)" — required, not
  optional — when the parent product's category is `FIXED`. Weight stays a
  required field in both modes (shipping).
- No product-level or category-management UI added (out of scope, §3).

## 9. Testing

- `compute-cart-totals.test.ts`: add cases for mixed carts, fixed-only
  carts, weight-based-only carts (unchanged behavior).
- `resolve-shipping.test.ts`: add the bypass case (zero weight-based grams
  → always meets minimum, never free delivery) alongside existing band
  tests.
- `calculate-effective-price.use-case.test.ts`: add `FIXED` cases (returns
  `fixedPricePaise` verbatim, null `ratePerKgPaise`; throws on missing
  `fixedPricePaise`).
- Existing weight-based test cases must keep passing unchanged — this is an
  additive branch, not a rewrite of existing behavior.
