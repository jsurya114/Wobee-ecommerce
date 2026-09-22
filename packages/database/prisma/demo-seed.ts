import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import {
  AuthMethod,
  CartStatus,
  OfferDiscountType,
  OfferScope,
  PricingMode,
  PrismaClient,
  Role,
  type CouponType as CouponTypeT,
  type OrderStatus as OrderStatusT,
  type PaymentMethod as PaymentMethodT,
} from "../generated/client";

const prisma = new PrismaClient();

// Fixed, arbitrary namespace (RFC 4122 Appendix C's example namespace —
// any fixed UUID works for a private, non-DNS name).
const DEMO_UUID_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

/**
 * Deterministic UUID (v5-style, SHA-1 per RFC 4122 §4.3) derived from a
 * stable string key: the SAME key always produces the SAME id, so it's safe
 * to upsert on across re-runs, but the result is still a real, valid UUID —
 * required because several live customer flows (cart, wishlist, returns,
 * testimonials, product/offer filters — see @woobe/validation's
 * cart/wishlist/returns/testimonials/products/offers schemas) reject a
 * non-UUID productId/variantId/categoryId/offerId/orderId/orderItemId with a
 * 400 before it ever reaches the database. Only applied to Category, Product,
 * ProductVariant, Collection, Offer, Order and OrderItem — the entities
 * actually referenced that way; everything else keeps a human-readable
 * `demo-…` id, which is also how demo-reset.ts finds it.
 */
function deterministicUuid(key: string): string {
  const namespaceBytes = Buffer.from(DEMO_UUID_NAMESPACE.replace(/-/g, ""), "hex");
  const hash = createHash("sha1").update(namespaceBytes).update(Buffer.from(key, "utf8")).digest();
  const bytes = hash.subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Presentation / demo dataset (2026-09-21). Everything this script creates is
 * namespaced under the `demo-` id/slug/sku/code prefix (or the
 * `@demo.woobe.in` email domain) so it can be found and removed by
 * `demo-reset.ts` without touching real data, and so re-running this script
 * (`pnpm demo:seed`) upserts the SAME rows instead of duplicating them.
 *
 * Every pricing/tax/shipping/cost formula below is duplicated (not imported)
 * from the api's domain layer, matching prisma/seed.ts's own "zero workspace
 * dependencies beyond @prisma/client" convention — see each function's doc
 * comment for the source file it mirrors.
 *
 * Images are deliberately NOT created here — Category.imageUrl and
 * ProductImage stay empty/absent so the admin's existing upload UI is what
 * attaches real photography later. Banner is the one exception: its
 * `imageUrl` column is NOT NULLABLE in the schema, so no schema-valid Banner
 * row can be created without either a real image or a fabricated placeholder
 * URL — this script creates none and the final report explains why.
 */

// ── Deterministic PRNG (mulberry32) so re-running the seed with the same
// inputs reproduces the same stock levels / coupon assignments, instead of
// drifting on every run. ──
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260921);

// ─────────────────────────────────────────────────────────────────────────
// Pure formulas duplicated from apps/api's domain layer (cited per function)
// ─────────────────────────────────────────────────────────────────────────

/** Mirrors packages/utils/src/weight.ts::calculateWeightBasedPricePaise. */
function calculateWeightBasedPricePaise(weightGrams: number, ratePerKgPaise: number): number {
  return Math.round((weightGrams * ratePerKgPaise) / 1000);
}

/** Mirrors packages/utils/src/money.ts::applyPercentage. */
function applyPercentage(paise: number, percent: number): number {
  return Math.round(paise * (percent / 100));
}

/** Mirrors apps/api orders/domain/unit-cost-snapshot.ts::computeUnitCostSnapshot. */
function computeUnitCostSnapshot(input: {
  pricingMode: "WEIGHT_BASED" | "FIXED";
  costPerKgPaise: number | null;
  costPricePaise: number | null;
  weightGrams: number;
}): number | null {
  if (input.pricingMode === "FIXED") {
    return input.costPricePaise !== null && input.costPricePaise >= 0 ? input.costPricePaise : null;
  }
  if (input.costPerKgPaise === null || input.costPerKgPaise < 0 || input.weightGrams < 0) return null;
  return Math.round((input.costPerKgPaise * input.weightGrams) / 1000);
}

/** Mirrors apps/api pricing/domain/resolve-gst-rate.ts::resolveGstRatePercent. */
function resolveGstRatePercent(slabs: { maxPricePaise: number | null; ratePercent: number }[], unitPricePaise: number): number {
  const sorted = [...slabs].sort((a, b) => {
    if (a.maxPricePaise === null) return 1;
    if (b.maxPricePaise === null) return -1;
    return a.maxPricePaise - b.maxPricePaise;
  });
  const match = sorted.find((slab) => slab.maxPricePaise === null || unitPricePaise <= slab.maxPricePaise);
  if (!match) throw new Error(`resolveGstRatePercent: no GST slab covers ${unitPricePaise} paise`);
  return match.ratePercent;
}

/** Mirrors apps/api shipping/domain/resolve-shipping.ts::resolveShippingEvaluation. */
function resolveShippingEvaluation(
  weightBasedTotalGrams: number,
  rule: { minWeightGramsForCheckout: number; freeDeliveryThresholdGrams: number; standardFeePaise: number },
): { meetsMinimum: boolean; isFreeDelivery: boolean; shippingFeePaise: number } {
  const hasWeightBasedItems = weightBasedTotalGrams > 0;
  const meetsMinimum = !hasWeightBasedItems || weightBasedTotalGrams >= rule.minWeightGramsForCheckout;
  const isFreeDelivery = hasWeightBasedItems && weightBasedTotalGrams >= rule.freeDeliveryThresholdGrams;
  return { meetsMinimum, isFreeDelivery, shippingFeePaise: meetsMinimum && !isFreeDelivery ? rule.standardFeePaise : 0 };
}

/** Mirrors apps/api offers/domain/calculate-offer-discount.ts::calculateOfferDiscount. */
function calculateOfferDiscount(offer: { discountType: OfferDiscountType; discountValue: number }, basePricePaise: number): number {
  const discountPaise = offer.discountType === "PERCENTAGE" ? Math.floor((basePricePaise * offer.discountValue) / 100) : offer.discountValue;
  return Math.min(discountPaise, basePricePaise);
}

interface OfferForResolution {
  id: string;
  name: string;
  discountType: OfferDiscountType;
  discountValue: number;
  scope: OfferScope;
  categoryId: string | null;
  priority: number;
  productIds: string[];
}

/** Mirrors apps/api offers/domain/resolve-applicable-offer.ts::resolveApplicableOffer. */
function resolveApplicableOffer(
  candidates: OfferForResolution[],
  product: { productId: string; categoryId: string },
  basePricePaise: number,
): OfferForResolution | null {
  const matching = candidates.filter((offer) => {
    if (offer.scope === "ALL_PRODUCTS") return true;
    if (offer.scope === "CATEGORY") return offer.categoryId === product.categoryId;
    return offer.productIds.includes(product.productId);
  });
  if (matching.length === 0) return null;
  if (matching.length === 1) return matching[0]!;

  const specificity: Record<OfferScope, number> = { PRODUCTS: 3, CATEGORY: 2, ALL_PRODUCTS: 1 };
  const sorted = [...matching].sort((a, b) => {
    const specificityDiff = specificity[b.scope] - specificity[a.scope];
    if (specificityDiff !== 0) return specificityDiff;
    const priorityDiff = b.priority - a.priority;
    if (priorityDiff !== 0) return priorityDiff;
    const discountDiff = calculateOfferDiscount(b, basePricePaise) - calculateOfferDiscount(a, basePricePaise);
    if (discountDiff !== 0) return discountDiff;
    return a.id.localeCompare(b.id);
  });
  return sorted[0]!;
}

/** Mirrors apps/api coupons/domain/calculate-coupon-discount.ts::calculateCouponDiscount. */
function calculateCouponDiscount(coupon: { type: CouponTypeT; value: number; maxDiscountPaise: number | null }, eligibleLineTotalPaise: number): number {
  let discountPaise = coupon.type === "PERCENTAGE" ? Math.floor((eligibleLineTotalPaise * coupon.value) / 100) : coupon.value;
  if (coupon.maxDiscountPaise !== null) discountPaise = Math.min(discountPaise, coupon.maxDiscountPaise);
  return Math.min(discountPaise, eligibleLineTotalPaise);
}

/** Mirrors apps/api orders/domain/allocate-coupon-discount.ts::allocateCouponDiscount. */
function allocateCouponDiscount(discountPaise: number, eligibleLines: { variantId: string; lineTotalPaise: number }[]): Map<string, number> {
  const allocation = new Map<string, number>();
  if (discountPaise <= 0 || eligibleLines.length === 0) return allocation;
  const eligibleTotalPaise = eligibleLines.reduce((sum, l) => sum + l.lineTotalPaise, 0);
  if (eligibleTotalPaise <= 0) return allocation;
  const shares = eligibleLines.map((l) => (discountPaise * l.lineTotalPaise) / eligibleTotalPaise);
  const floored = shares.map(Math.floor);
  const flooredTotal = floored.reduce((sum, v) => sum + v, 0);
  let remainder = discountPaise - flooredTotal;
  const byFractionDesc = shares.map((share, i) => ({ i, fraction: share - Math.floor(share) })).sort((a, b) => b.fraction - a.fraction);
  for (const { i } of byFractionDesc) {
    if (remainder <= 0) break;
    floored[i]! += 1;
    remainder -= 1;
  }
  eligibleLines.forEach((line, i) => allocation.set(line.variantId, floored[i]!));
  return allocation;
}

// ─────────────────────────────────────────────────────────────────────────
// Demo catalogue data
// ─────────────────────────────────────────────────────────────────────────

const CATEGORY_DEFS = [
  { key: "tops", name: "Tops", code: "TOP", sortOrder: 1 },
  { key: "dresses", name: "Dresses", code: "DRS", sortOrder: 2 },
  { key: "bottoms", name: "Bottoms", code: "BTM", sortOrder: 3 },
  { key: "shirts", name: "Shirts", code: "SHT", sortOrder: 4 },
  { key: "co-ords", name: "Co-ords", code: "CRD", sortOrder: 5 },
  { key: "jackets", name: "Jackets", code: "JKT", sortOrder: 6 },
  { key: "ethnic-wear", name: "Ethnic Wear", code: "ETH", sortOrder: 7 },
  { key: "accessories", name: "Accessories", code: "ACC", sortOrder: 8 },
] as const;

const COLOR_CODE: Record<string, string> = {
  Black: "BLK",
  Ivory: "IVY",
  Beige: "BEI",
  Blush: "BLH",
  Wine: "WIN",
  Olive: "OLV",
  Navy: "NAV",
  Emerald: "EMR",
  Brown: "BRN",
  Denim: "DNM",
  White: "WHT",
};

interface ProductDef {
  key: string;
  name: string;
  categoryKey: (typeof CATEGORY_DEFS)[number]["key"];
  pricingMode: "WEIGHT_BASED" | "FIXED";
  fixedPricePaise?: number;
  colors: string[];
  sizes: string[];
  baseWeightGrams: number;
  fabric: string;
  fit: string;
  description: string;
}

const PRODUCT_DEFS: ProductDef[] = [
  // ── TOPS ──
  {
    key: "ribbed-knit-top",
    name: "Ribbed Knit Top",
    categoryKey: "tops",
    pricingMode: "WEIGHT_BASED",
    colors: ["Ivory", "Wine"],
    sizes: ["S", "M", "L"],
    baseWeightGrams: 320,
    fabric: "Ribbed cotton-spandex knit",
    fit: "Fitted, stretch-friendly",
    description: "A second-skin ribbed knit top with a flattering close fit — layers cleanly under a shirt or jacket, or wears alone with high-waisted denim.",
  },
  {
    key: "satin-wrap-top",
    name: "Satin Wrap Top",
    categoryKey: "tops",
    pricingMode: "WEIGHT_BASED",
    colors: ["Blush", "Black"],
    sizes: ["S", "M", "L"],
    baseWeightGrams: 260,
    fabric: "Liquid satin",
    fit: "Wrap silhouette, adjustable tie",
    description: "A liquid-satin wrap top with a self-tie waist that adjusts to fit — dressy enough for evening, simple enough for a Tuesday desk day.",
  },
  {
    key: "relaxed-cotton-tee",
    name: "Relaxed Cotton Tee",
    categoryKey: "tops",
    pricingMode: "WEIGHT_BASED",
    colors: ["White", "Olive"],
    sizes: ["XS", "S", "M", "L"],
    baseWeightGrams: 220,
    fabric: "100% combed cotton",
    fit: "Relaxed, dropped shoulder",
    description: "The everyday tee done right: heavyweight combed cotton, a dropped shoulder, and a length that stays tucked or untucked without complaint.",
  },
  {
    key: "pleated-sleeve-blouse",
    name: "Pleated Sleeve Blouse",
    categoryKey: "tops",
    pricingMode: "WEIGHT_BASED",
    colors: ["Ivory", "Navy"],
    sizes: ["S", "M", "L"],
    baseWeightGrams: 280,
    fabric: "Crepe",
    fit: "Semi-fitted, pleated sleeve",
    description: "Soft crepe blouse with a single pleat at each sleeve for a bit of volume — reads polished without trying hard.",
  },
  // ── DRESSES ──
  {
    key: "linen-tier-dress",
    name: "Linen Tier Dress",
    categoryKey: "dresses",
    pricingMode: "WEIGHT_BASED",
    colors: ["Beige", "Olive"],
    sizes: ["S", "M", "L"],
    baseWeightGrams: 420,
    fabric: "Pure linen",
    fit: "Tiered, relaxed",
    description: "Three tiers of pure linen that move with you — breathable enough for a long lunch outdoors, structured enough not to look like loungewear.",
  },
  {
    key: "floral-midi-dress",
    name: "Floral Midi Dress",
    categoryKey: "dresses",
    pricingMode: "WEIGHT_BASED",
    colors: ["Blush", "Emerald"],
    sizes: ["S", "M", "L"],
    baseWeightGrams: 380,
    fabric: "Viscose crepe",
    fit: "Fit-and-flare",
    description: "A fit-and-flare midi in a small-scale floral print, with a self-belt that defines the waist without needing to be adjusted twice.",
  },
  {
    key: "ruched-day-dress",
    name: "Ruched Day Dress",
    categoryKey: "dresses",
    pricingMode: "WEIGHT_BASED",
    colors: ["Wine", "Black"],
    sizes: ["S", "M", "L"],
    baseWeightGrams: 350,
    fabric: "Jersey",
    fit: "Body-skimming, side ruching",
    description: "Side ruching does the shaping work here — a jersey day dress that goes from desk to dinner without a costume change.",
  },
  {
    key: "satin-slip-dress",
    name: "Satin Slip Dress",
    categoryKey: "dresses",
    pricingMode: "FIXED",
    fixedPricePaise: 220_00,
    colors: ["Ivory", "Black"],
    sizes: ["S", "M", "L"],
    baseWeightGrams: 320,
    fabric: "Satin",
    fit: "Bias-cut slip",
    description: "A bias-cut satin slip in the quiet-luxury vein — cut close, falls clean, and needs nothing else to make an entrance.",
  },
  {
    key: "printed-wrap-dress",
    name: "Printed Wrap Dress",
    categoryKey: "dresses",
    pricingMode: "WEIGHT_BASED",
    colors: ["Navy", "Beige"],
    sizes: ["S", "M", "L"],
    baseWeightGrams: 360,
    fabric: "Rayon",
    fit: "Wrap, adjustable",
    description: "A printed wrap dress that ties at the waist and adjusts to fit — one dress that works for both a wedding lunch and a work call.",
  },
  // ── BOTTOMS ──
  {
    key: "wide-leg-trousers",
    name: "Wide Leg Trousers",
    categoryKey: "bottoms",
    pricingMode: "WEIGHT_BASED",
    colors: ["Black", "Beige"],
    sizes: ["S", "M", "L", "XL"],
    baseWeightGrams: 480,
    fabric: "Twill",
    fit: "High-rise, wide leg",
    description: "High-rise twill trousers with a wide leg that skims rather than clings — the trouser equivalent of a good handshake.",
  },
  {
    key: "straight-fit-jeans",
    name: "Straight Fit Jeans",
    categoryKey: "bottoms",
    pricingMode: "WEIGHT_BASED",
    colors: ["Denim", "Black"],
    sizes: ["S", "M", "L", "XL"],
    baseWeightGrams: 650,
    fabric: "Stretch denim",
    fit: "Straight, mid-rise",
    description: "A straight-leg stretch denim that holds its shape through a full day — mid-rise, no gap at the back waistband, no drama.",
  },
  {
    key: "linen-relaxed-pants",
    name: "Linen Relaxed Pants",
    categoryKey: "bottoms",
    pricingMode: "WEIGHT_BASED",
    colors: ["Beige", "Olive"],
    sizes: ["S", "M", "L"],
    baseWeightGrams: 420,
    fabric: "Linen blend",
    fit: "Relaxed, elastic waist",
    description: "Relaxed linen-blend pants with an elastic waist that still looks tailored — the trousers that survive a 40-degree commute.",
  },
  {
    key: "pleated-culottes",
    name: "Pleated Culottes",
    categoryKey: "bottoms",
    pricingMode: "WEIGHT_BASED",
    colors: ["Navy", "Wine"],
    sizes: ["S", "M", "L"],
    baseWeightGrams: 460,
    fabric: "Crepe",
    fit: "Wide, cropped",
    description: "Wide, cropped culottes with box pleats at the waist — enough movement to read as a skirt, enough structure to read as trousers.",
  },
  // ── SHIRTS ──
  {
    key: "oversized-linen-shirt",
    name: "Oversized Linen Shirt",
    categoryKey: "shirts",
    pricingMode: "WEIGHT_BASED",
    colors: ["White", "Beige"],
    sizes: ["S", "M", "L"],
    baseWeightGrams: 380,
    fabric: "Pure linen",
    fit: "Oversized",
    description: "An oversized linen shirt built to be worn open over a slip dress, tucked into trousers, or on its own with nothing but the sun.",
  },
  {
    key: "satin-button-shirt",
    name: "Satin Button Shirt",
    categoryKey: "shirts",
    pricingMode: "WEIGHT_BASED",
    colors: ["Ivory", "Emerald"],
    sizes: ["S", "M", "L"],
    baseWeightGrams: 260,
    fabric: "Satin",
    fit: "Relaxed, curved hem",
    description: "A satin button-down with a curved hem that stays put whether it's tucked in or left loose — quietly does the most.",
  },
  {
    key: "textured-cotton-shirt",
    name: "Textured Cotton Shirt",
    categoryKey: "shirts",
    pricingMode: "WEIGHT_BASED",
    colors: ["Navy", "White"],
    sizes: ["S", "M", "L"],
    baseWeightGrams: 340,
    fabric: "Dobby cotton",
    fit: "Regular",
    description: "Subtly textured dobby cotton in a true regular fit — the shirt that goes under a blazer without anyone noticing the effort.",
  },
  {
    key: "relaxed-stripe-shirt",
    name: "Relaxed Stripe Shirt",
    categoryKey: "shirts",
    pricingMode: "WEIGHT_BASED",
    colors: ["Navy", "Ivory"],
    sizes: ["S", "M", "L"],
    baseWeightGrams: 300,
    fabric: "Cotton poplin",
    fit: "Relaxed",
    description: "A relaxed cotton poplin shirt in a fine stripe — the kind of basic that quietly earns its keep every week.",
  },
  // ── CO-ORDS ──
  {
    key: "relaxed-lounge-co-ord",
    name: "Relaxed Lounge Co-ord",
    categoryKey: "co-ords",
    pricingMode: "WEIGHT_BASED",
    colors: ["Beige", "Wine"],
    sizes: ["S", "M", "L"],
    baseWeightGrams: 550,
    fabric: "Brushed cotton",
    fit: "Relaxed, matching set",
    description: "A brushed-cotton top and pant set built for the in-between hours — too put-together for pyjamas, too easy for anything formal.",
  },
  {
    key: "linen-shirt-and-pants-set",
    name: "Linen Shirt & Pants Set",
    categoryKey: "co-ords",
    pricingMode: "WEIGHT_BASED",
    colors: ["Beige", "Olive"],
    sizes: ["S", "M", "L"],
    baseWeightGrams: 600,
    fabric: "Pure linen",
    fit: "Relaxed, matching set",
    description: "A matching linen shirt and trouser set — wear it together for an instant outfit, or split the pieces across the rest of the wardrobe.",
  },
  {
    key: "ribbed-knit-co-ord",
    name: "Ribbed Knit Co-ord",
    categoryKey: "co-ords",
    pricingMode: "WEIGHT_BASED",
    colors: ["Wine", "Navy"],
    sizes: ["S", "M", "L"],
    baseWeightGrams: 520,
    fabric: "Ribbed knit",
    fit: "Fitted, matching set",
    description: "A ribbed knit crop top and midi skirt set in a fitted silhouette — one outfit decision made for you, twice over.",
  },
  {
    key: "weekend-cotton-co-ord",
    name: "Weekend Cotton Co-ord",
    categoryKey: "co-ords",
    pricingMode: "FIXED",
    fixedPricePaise: 160_00,
    colors: ["Olive", "Black"],
    sizes: ["S", "M", "L"],
    baseWeightGrams: 500,
    fabric: "Cotton twill",
    fit: "Relaxed, matching set",
    description: "A boxy shirt and shorts set in heavyweight cotton twill, priced flat as a limited weekend run — while stock lasts.",
  },
  // ── JACKETS ──
  {
    key: "classic-denim-jacket",
    name: "Classic Denim Jacket",
    categoryKey: "jackets",
    pricingMode: "WEIGHT_BASED",
    colors: ["Denim", "Black"],
    sizes: ["S", "M", "L"],
    baseWeightGrams: 750,
    fabric: "Rigid denim",
    fit: "Cropped, boxy",
    description: "A cropped denim jacket with a boxy fit and contrast stitching — the layer that makes every outfit under it look intentional.",
  },
  {
    key: "cropped-utility-jacket",
    name: "Cropped Utility Jacket",
    categoryKey: "jackets",
    pricingMode: "FIXED",
    fixedPricePaise: 320_00,
    colors: ["Olive", "Black"],
    sizes: ["S", "M", "L"],
    baseWeightGrams: 650,
    fabric: "Cotton canvas",
    fit: "Cropped, structured",
    description: "A structured cotton-canvas utility jacket with four patch pockets — a small-batch piece, priced flat rather than by weight.",
  },
  {
    key: "lightweight-overshirt",
    name: "Lightweight Overshirt",
    categoryKey: "jackets",
    pricingMode: "WEIGHT_BASED",
    colors: ["Beige", "Navy"],
    sizes: ["S", "M", "L"],
    baseWeightGrams: 420,
    fabric: "Cotton flannel",
    fit: "Relaxed, boxy",
    description: "A lightweight flannel overshirt that works buttoned as a jacket or open as a layer — the transitional-season problem, solved.",
  },
  // ── ETHNIC WEAR ──
  {
    key: "cotton-everyday-kurta",
    name: "Cotton Everyday Kurta",
    categoryKey: "ethnic-wear",
    pricingMode: "WEIGHT_BASED",
    colors: ["Ivory", "Olive"],
    sizes: ["S", "M", "L", "XL"],
    baseWeightGrams: 300,
    fabric: "Pure cotton",
    fit: "Straight, knee-length",
    description: "A straight-cut cotton kurta built for daily wear — breathable, unfussy, and as easy over leggings as it is over jeans.",
  },
  {
    key: "embroidered-kurta",
    name: "Embroidered Kurta",
    categoryKey: "ethnic-wear",
    pricingMode: "WEIGHT_BASED",
    colors: ["Wine", "Navy"],
    sizes: ["S", "M", "L"],
    baseWeightGrams: 340,
    fabric: "Cotton silk",
    fit: "A-line",
    description: "Fine thread embroidery along the neckline and hem lifts this A-line kurta from everyday to occasion-ready without changing its silhouette.",
  },
  {
    key: "printed-anarkali",
    name: "Printed Anarkali",
    categoryKey: "ethnic-wear",
    pricingMode: "WEIGHT_BASED",
    colors: ["Emerald", "Wine"],
    sizes: ["S", "M", "L"],
    baseWeightGrams: 480,
    fabric: "Georgette",
    fit: "Flared, floor-length",
    description: "A floor-length Anarkali in flowing georgette with an all-over print — full flare, minimal fuss, built to move on a dance floor.",
  },
  {
    key: "festive-straight-kurta",
    name: "Festive Straight Kurta",
    categoryKey: "ethnic-wear",
    pricingMode: "FIXED",
    fixedPricePaise: 180_00,
    colors: ["Wine", "Emerald"],
    sizes: ["S", "M", "L"],
    baseWeightGrams: 360,
    fabric: "Chanderi silk",
    fit: "Straight",
    description: "A straight-cut Chanderi silk kurta with a subtle sheen, priced as a flat festive-edit piece rather than by weight.",
  },
  // ── ACCESSORIES (all FIXED, all ONE SIZE) ──
  {
    key: "enamel-bangle-set",
    name: "Enamel Bangle Set",
    categoryKey: "accessories",
    pricingMode: "FIXED",
    fixedPricePaise: 65_00,
    colors: ["Wine", "Emerald"],
    sizes: ["ONE SIZE"],
    baseWeightGrams: 120,
    fabric: "Brass, enamel",
    fit: "Set of 4",
    description: "A set of four slim enamel bangles with a hand-painted floral motif — mix within the set or stack against plain metal.",
  },
  {
    key: "statement-earrings",
    name: "Statement Earrings",
    categoryKey: "accessories",
    pricingMode: "FIXED",
    fixedPricePaise: 45_00,
    colors: ["Black", "Ivory"],
    sizes: ["ONE SIZE"],
    baseWeightGrams: 25,
    fabric: "Alloy, resin",
    fit: "One size",
    description: "Oversized statement earrings in a matte finish — light enough to wear all day, bold enough to be the only jewellery you need.",
  },
  {
    key: "minimal-necklace",
    name: "Minimal Necklace",
    categoryKey: "accessories",
    pricingMode: "FIXED",
    fixedPricePaise: 55_00,
    colors: ["Ivory", "Black"],
    sizes: ["ONE SIZE"],
    baseWeightGrams: 35,
    fabric: "Brass, gold-plated",
    fit: "One size",
    description: "A single delicate chain with a small pendant — the necklace that layers under everything and competes with nothing.",
  },
  {
    key: "printed-scarf",
    name: "Printed Scarf",
    categoryKey: "accessories",
    pricingMode: "FIXED",
    fixedPricePaise: 39_00,
    colors: ["Beige", "Wine"],
    sizes: ["ONE SIZE"],
    baseWeightGrams: 70,
    fabric: "Modal",
    fit: "One size",
    description: "A lightweight modal scarf in a small print, generous enough to wear as a shawl or knotted small as a neck scarf.",
  },
  {
    key: "structured-tote",
    name: "Structured Tote",
    categoryKey: "accessories",
    pricingMode: "FIXED",
    fixedPricePaise: 145_00,
    colors: ["Brown", "Black"],
    sizes: ["ONE SIZE"],
    baseWeightGrams: 450,
    fabric: "Vegan leather",
    fit: "One size",
    description: "A structured tote in vegan leather with a flat base that holds its shape empty or full — the bag that goes from laptop to weekend.",
  },
  {
    key: "woven-belt",
    name: "Woven Belt",
    categoryKey: "accessories",
    pricingMode: "FIXED",
    fixedPricePaise: 39_00,
    colors: ["Brown", "Black"],
    sizes: ["ONE SIZE"],
    baseWeightGrams: 90,
    fabric: "Woven leather",
    fit: "One size",
    description: "A woven leather belt with a matte buckle — slim enough for dresses, sized long enough for high-waisted trousers.",
  },
];

const COST_RATIO = 0.55; // 45% gross margin placeholder — see final report

const SIZE_WEIGHT_STEP: Record<string, number> = { XS: -40, S: -20, M: 0, L: 20, XL: 40, "ONE SIZE": 0 };

const COLLECTION_DEFS = [
  { key: "new-arrivals", name: "New Arrivals", description: "Freshly landed this week." },
  { key: "autumn-edit", name: "Autumn Edit", description: "Warm neutrals and layering pieces for the season." },
  { key: "everyday-essentials", name: "Everyday Essentials", description: "The pieces that earn their place in daily rotation." },
  { key: "weekend-styles", name: "Weekend Styles", description: "Easy, relaxed pieces for off-duty days." },
  { key: "premium-picks", name: "Premium Picks", description: "Limited-run and elevated pieces, priced flat." },
] as const;

const CUSTOMER_NAMES = [
  "Ananya Rao",
  "Priya Nair",
  "Kavya Menon",
  "Ishita Verma",
  "Meera Pillai",
  "Sanya Kapoor",
  "Divya Iyer",
  "Riya Shah",
  "Neha Joshi",
  "Aditi Bose",
  "Pooja Reddy",
  "Simran Kaur",
  "Trisha Das",
  "Nandini Rao",
  "Vidya Krishnan",
  "Anjali Mehta",
  "Sneha Pillai",
  "Radhika Nambiar",
  "Fatima Sheikh",
  "Gauri Deshmukh",
] as const;

const CITIES = [
  { city: "Bengaluru", state: "Karnataka", pincode: "560034" },
  { city: "Mumbai", state: "Maharashtra", pincode: "400050" },
  { city: "Delhi", state: "Delhi", pincode: "110024" },
  { city: "Hyderabad", state: "Telangana", pincode: "500034" },
  { city: "Chennai", state: "Tamil Nadu", pincode: "600018" },
  { city: "Pune", state: "Maharashtra", pincode: "411001" },
  { city: "Kolkata", state: "West Bengal", pincode: "700019" },
] as const;

function daysAgo(n: number, hour = 10): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, randInt(0, 59), 0, 0);
  return d;
}
function randInt(min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

// ─────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Seeding Woobe presentation / demo dataset...\n");

  // ── 1. Baseline operational config — never duplicated, only filled if missing ──
  let warehouse = await prisma.warehouse.findFirst({ where: { isActive: true } });
  if (!warehouse) {
    warehouse = await prisma.warehouse.create({
      data: { code: "WH-MAIN", name: "Woobe Main Warehouse", line1: "Plot 42, Industrial Layout", city: "Bengaluru", state: "Karnataka", pincode: "560058" },
    });
    console.log("  [baseline] created Warehouse WH-MAIN (none existed)");
  }

  let pricingSetting = await prisma.pricingSetting.findFirst({ orderBy: { effectiveFrom: "desc" } });
  if (!pricingSetting) {
    pricingSetting = await prisma.pricingSetting.create({ data: { defaultRatePerKgPaise: 120_000 } });
    console.log("  [baseline] created PricingSetting (none existed) — ₹1,200/kg placeholder");
  }
  const ratePerKgPaise = pricingSetting.defaultRatePerKgPaise;

  let shippingRule = await prisma.shippingRule.findFirst({ orderBy: { effectiveFrom: "desc" } });
  if (!shippingRule) {
    shippingRule = await prisma.shippingRule.create({
      data: { minWeightGramsForCheckout: 1000, freeDeliveryThresholdGrams: 1500, standardFeePaise: 5_000 },
    });
    console.log("  [baseline] created ShippingRule (none existed)");
  }

  let gstSlabs = await prisma.gstSlab.findMany();
  if (gstSlabs.length === 0) {
    await prisma.gstSlab.create({ data: { maxPricePaise: 250_000, ratePercent: 5 } });
    await prisma.gstSlab.create({ data: { maxPricePaise: null, ratePercent: 18 } });
    gstSlabs = await prisma.gstSlab.findMany();
    console.log("  [baseline] created 2 GstSlab rows (none existed)");
  }

  // ── 2. Categories ──
  const categories: Record<string, { id: string; categoryId: string }> = {};
  for (const c of CATEGORY_DEFS) {
    const id = deterministicUuid(`demo-category-${c.key}`);
    const row = await prisma.category.upsert({
      where: { id },
      update: { name: c.name, sortOrder: c.sortOrder, isActive: true },
      create: { id, name: c.name, slug: `demo-${c.key}`, sortOrder: c.sortOrder, isActive: true },
    });
    categories[c.key] = { id: row.id, categoryId: row.id };
  }
  console.log(`  Categories: ${CATEGORY_DEFS.length}`);

  // ── 3. Collections ──
  const collections: Record<string, { id: string }> = {};
  for (const c of COLLECTION_DEFS) {
    const id = deterministicUuid(`demo-collection-${c.key}`);
    const row = await prisma.collection.upsert({
      where: { id },
      update: { name: c.name, description: c.description },
      create: { id, name: c.name, slug: `demo-${c.key}`, description: c.description },
    });
    collections[c.key] = { id: row.id };
  }
  console.log(`  Collections: ${COLLECTION_DEFS.length}`);

  // ── 4. Products + variants + inventory ──
  type VariantRow = { id: string; sku: string; color: string; size: string; weightGrams: number; fixedPricePaise: number | null; costPricePaise: number | null };
  type ProductRow = { id: string; categoryId: string; pricingMode: "WEIGHT_BASED" | "FIXED"; costPerKgPaise: number | null; name: string };
  const products: (ProductRow & { def: ProductDef; variants: VariantRow[] })[] = [];

  let stockCursor = 0;
  for (const [pIndex, def] of PRODUCT_DEFS.entries()) {
    const categoryDef = CATEGORY_DEFS.find((c) => c.key === def.categoryKey)!;
    const categoryId = categories[def.categoryKey]!.id;
    const productId = deterministicUuid(`demo-product-${def.key}`);
    const costPerKgPaise = def.pricingMode === "WEIGHT_BASED" ? Math.round(ratePerKgPaise * COST_RATIO) : null;

    const variantPrices = def.colors.flatMap(() =>
      def.sizes.map((size) => {
        const weight = def.baseWeightGrams + (SIZE_WEIGHT_STEP[size] ?? 0);
        return def.pricingMode === "FIXED" ? def.fixedPricePaise! : calculateWeightBasedPricePaise(weight, ratePerKgPaise);
      }),
    );
    const minPricePaiseCache = Math.min(...variantPrices);

    const product = await prisma.product.upsert({
      where: { id: productId },
      update: { name: def.name, description: def.description, categoryId, pricingMode: def.pricingMode as PricingMode, minPricePaiseCache, costPerKgPaise, isActive: true },
      create: {
        id: productId,
        name: def.name,
        slug: `demo-${def.key}`,
        description: def.description,
        categoryId,
        pricingMode: def.pricingMode as PricingMode,
        minPricePaiseCache,
        costPerKgPaise,
        isActive: true,
        metaTitle: def.name,
        metaDescription: def.description.slice(0, 155),
      },
    });

    const variants: VariantRow[] = [];
    for (const color of def.colors) {
      for (const size of def.sizes) {
        const weightGrams = def.baseWeightGrams + (SIZE_WEIGHT_STEP[size] ?? 0);
        const colorCode = COLOR_CODE[color] ?? color.slice(0, 3).toUpperCase();
        const sizeCode = size.replace(/\s+/g, "");
        const sku = `DEMO-${categoryDef.code}-${String(pIndex + 1).padStart(3, "0")}-${sizeCode}-${colorCode}`;
        const fixedPricePaise = def.pricingMode === "FIXED" ? def.fixedPricePaise! : null;
        const costPricePaise = def.pricingMode === "FIXED" ? Math.round(def.fixedPricePaise! * COST_RATIO) : null;
        const effectivePricePaiseCache = def.pricingMode === "FIXED" ? def.fixedPricePaise! : calculateWeightBasedPricePaise(weightGrams, ratePerKgPaise);

        const variant = await prisma.productVariant.upsert({
          where: { sku },
          update: { fixedPricePaise, costPricePaise, effectivePricePaiseCache, weightGrams, isActive: true, fabric: def.fabric, fit: def.fit },
          create: {
            id: deterministicUuid(`demo-variant-${sku}`),
            productId: product.id,
            sku,
            color,
            size,
            weightGrams,
            fixedPricePaise,
            costPricePaise,
            effectivePricePaiseCache,
            fabric: def.fabric,
            fit: def.fit,
          },
        });

        // Stock distribution: ~20% low (1-5), 50% normal (6-30), 30% high (31-80).
        const bucket = stockCursor % 10;
        const quantityAvailable = bucket < 2 ? randInt(1, 5) : bucket < 7 ? randInt(6, 30) : randInt(31, 80);
        stockCursor += 1;

        await prisma.inventory.upsert({
          where: { variantId_warehouseId: { variantId: variant.id, warehouseId: warehouse.id } },
          update: { quantityAvailable },
          create: { variantId: variant.id, warehouseId: warehouse.id, quantityAvailable, quantityReserved: 0 },
        });

        variants.push({ id: variant.id, sku: variant.sku, color, size, weightGrams, fixedPricePaise, costPricePaise });
      }
    }

    products.push({ id: product.id, categoryId: product.categoryId, pricingMode: def.pricingMode, costPerKgPaise, name: product.name, def, variants });
  }
  console.log(`  Products: ${products.length} (${products.filter((p) => p.pricingMode === "FIXED").length} FIXED, ${products.filter((p) => p.pricingMode === "WEIGHT_BASED").length} WEIGHT_BASED)`);
  console.log(`  Variants: ${products.reduce((s, p) => s + p.variants.length, 0)}`);

  // ── 5. Collection assignments ──
  const collectionAssignments: Record<string, string[]> = {
    "new-arrivals": ["ribbed-knit-top", "floral-midi-dress", "printed-wrap-dress", "textured-cotton-shirt", "ribbed-knit-co-ord", "lightweight-overshirt", "embroidered-kurta", "oxidised-jhumka-earrings-missing"].filter((k) => products.some((p) => p.def.key === k)),
    "autumn-edit": ["classic-denim-jacket", "cropped-utility-jacket", "linen-relaxed-pants", "oversized-linen-shirt", "linen-tier-dress", "structured-tote"],
    "everyday-essentials": ["relaxed-cotton-tee", "cotton-everyday-kurta", "relaxed-stripe-shirt", "straight-fit-jeans", "wide-leg-trousers", "printed-scarf"],
    "weekend-styles": ["relaxed-lounge-co-ord", "weekend-cotton-co-ord", "linen-shirt-and-pants-set", "linen-relaxed-pants", "lightweight-overshirt"],
    "premium-picks": ["satin-slip-dress", "cropped-utility-jacket", "festive-straight-kurta", "printed-anarkali", "structured-tote", "minimal-necklace"],
  };
  for (const [collectionKey, productKeys] of Object.entries(collectionAssignments)) {
    let sortOrder = 0;
    for (const key of productKeys) {
      const product = products.find((p) => p.def.key === key);
      if (!product) continue;
      await prisma.productCollection.upsert({
        where: { productId_collectionId: { productId: product.id, collectionId: collections[collectionKey]!.id } },
        update: { sortOrder },
        create: { productId: product.id, collectionId: collections[collectionKey]!.id, sortOrder },
      });
      sortOrder += 1;
    }
  }
  console.log(`  Collection assignments: ${Object.values(collectionAssignments).reduce((s, arr) => s + arr.length, 0)}`);

  // ── 6. Offers ──
  const tops20Products = [products.find((p) => p.def.key === "ribbed-knit-top")!.id, products.find((p) => p.def.key === "linen-tier-dress")!.id];
  const offerDefs: { key: string; name: string; discountType: OfferDiscountType; discountValue: number; scope: OfferScope; categoryId: string | null; priority: number; productIds: string[] }[] = [
    { key: "sitewide10", name: "Sitewide 10% Off", discountType: "PERCENTAGE", discountValue: 10, scope: "ALL_PRODUCTS", categoryId: null, priority: 0, productIds: [] },
    { key: "tops15", name: "Tops — 15% Off", discountType: "PERCENTAGE", discountValue: 15, scope: "CATEGORY", categoryId: categories["tops"]!.id, priority: 1, productIds: [] },
    { key: "ethnic200off", name: "Ethnic Wear — ₹200 Off", discountType: "FIXED_AMOUNT", discountValue: 200_00, scope: "CATEGORY", categoryId: categories["ethnic-wear"]!.id, priority: 1, productIds: [] },
    { key: "spotlight20", name: "Spotlight — 20% Off", discountType: "PERCENTAGE", discountValue: 20, scope: "PRODUCTS", categoryId: null, priority: 2, productIds: tops20Products },
  ];
  const now = new Date();
  const offerStart = new Date(now.getTime() - 30 * 86400000);
  const offerEnd = new Date(now.getTime() + 60 * 86400000);
  const offers: OfferForResolution[] = [];
  for (const o of offerDefs) {
    const id = deterministicUuid(`demo-offer-${o.key}`);
    await prisma.offer.upsert({
      where: { id },
      update: { name: o.name, discountType: o.discountType, discountValue: o.discountValue, scope: o.scope, categoryId: o.categoryId, priority: o.priority, isActive: true, startsAt: offerStart, endsAt: offerEnd },
      create: { id, name: o.name, discountType: o.discountType, discountValue: o.discountValue, scope: o.scope, categoryId: o.categoryId, priority: o.priority, startsAt: offerStart, endsAt: offerEnd },
    });
    for (const productId of o.productIds) {
      await prisma.offerProduct.upsert({ where: { offerId_productId: { offerId: id, productId } }, update: {}, create: { offerId: id, productId } });
    }
    offers.push({ id, name: o.name, discountType: o.discountType, discountValue: o.discountValue, scope: o.scope, categoryId: o.categoryId, priority: o.priority, productIds: o.productIds });
  }
  console.log(`  Offers: ${offers.length}`);

  // ── 7. Coupons ──
  const farFuture = new Date("2999-01-01");
  const longPast = new Date("2020-01-01");
  type CouponRow = { code: string; type: CouponTypeT; value: number; minCartValuePaise: number | null; maxDiscountPaise: number | null };
  const couponDefs: CouponRow[] = [
    { code: "DEMO-WELCOME10", type: "PERCENTAGE", value: 10, minCartValuePaise: null, maxDiscountPaise: null },
    { code: "DEMO-STYLE200", type: "FLAT", value: 200_00, minCartValuePaise: 1500_00, maxDiscountPaise: null },
    { code: "DEMO-AUTUMN15", type: "PERCENTAGE", value: 15, minCartValuePaise: 1000_00, maxDiscountPaise: 500_00 },
    // Closest schema-supported approximation of "first order" (no dedicated
    // first-order flag exists) — perUserLimit: 1 with a modest rate.
    { code: "DEMO-FIRSTORDER", type: "PERCENTAGE", value: 12, minCartValuePaise: 800_00, maxDiscountPaise: null },
  ];
  const coupons = new Map<string, CouponRow>();
  for (const c of couponDefs) {
    await prisma.coupon.upsert({
      where: { code: c.code },
      update: { type: c.type, value: c.value, minCartValuePaise: c.minCartValuePaise, maxDiscountPaise: c.maxDiscountPaise, isActive: true },
      create: {
        id: `demo-coupon-${c.code.toLowerCase()}`,
        code: c.code,
        type: c.type,
        value: c.value,
        minCartValuePaise: c.minCartValuePaise,
        maxDiscountPaise: c.maxDiscountPaise,
        usageLimit: c.code === "DEMO-STYLE200" ? 500 : c.code === "DEMO-AUTUMN15" ? 300 : null,
        perUserLimit: c.code === "DEMO-FIRSTORDER" ? 1 : 1,
        validFrom: longPast,
        validTo: farFuture,
      },
    });
    coupons.set(c.code, c);
  }
  console.log(`  Coupons: ${couponDefs.length}`);

  // ── 8. Customers + addresses ──
  const customerPasswordHash = await bcrypt.hash("Demo@12345", 12);
  type CustomerRow = { id: string; name: string; email: string; addressId: string; phone: string; city: string; state: string; pincode: string };
  const customers: CustomerRow[] = [];
  for (let i = 0; i < CUSTOMER_NAMES.length; i++) {
    const n = i + 1;
    const id = `demo-customer-${String(n).padStart(2, "0")}`;
    const email = `demo.customer${String(n).padStart(2, "0")}@example.com`;
    const name = CUSTOMER_NAMES[i]!;
    const phone = `9${String(700000000 + n * 137).padStart(9, "0")}`;
    const loc = CITIES[i % CITIES.length]!;

    const user = await prisma.user.upsert({
      where: { email },
      update: { name },
      create: { id, email, name, phone, role: Role.CUSTOMER, authCredentials: { create: { method: AuthMethod.PASSWORD, passwordHash: customerPasswordHash } } },
    });

    const addressId = `demo-address-${String(n).padStart(2, "0")}`;
    const address = await prisma.address.upsert({
      where: { id: addressId },
      update: { fullName: name, phone, city: loc.city, state: loc.state, pincode: loc.pincode },
      create: {
        id: addressId,
        userId: user.id,
        fullName: name,
        phone,
        line1: `${100 + n}, ${["Palm Grove", "Lake View", "Church Street", "MG Road", "Cross Street"][n % 5]} Road`,
        city: loc.city,
        state: loc.state,
        pincode: loc.pincode,
        isDefault: true,
      },
    });

    customers.push({ id: user.id, name, email, addressId: address.id, phone, city: loc.city, state: loc.state, pincode: loc.pincode });
  }
  console.log(`  Customers: ${customers.length} (password: Demo@12345, not a real credential)`);

  // ── 9. Abandoned carts — 7 carts, items backdated > 24h inactive ──
  let abandonedCartsCreated = 0;
  for (let i = 0; i < 7; i++) {
    const customer = customers[i]!;
    const itemCount = 1 + (i % 2);
    const backdated = daysAgo(2 + i);
    const cartId = `demo-cart-${String(i + 1).padStart(2, "0")}`;
    await prisma.cart.upsert({
      where: { id: cartId },
      update: { updatedAt: backdated },
      create: { id: cartId, userId: customer.id, status: CartStatus.ACTIVE, updatedAt: backdated },
    });
    for (let j = 0; j < itemCount; j++) {
      const product = products[(i * 5 + j * 3) % products.length]!;
      const variant = product.variants[j % product.variants.length]!;
      await prisma.cartItem.upsert({
        where: { cartId_variantId: { cartId, variantId: variant.id } },
        update: { quantity: 1, updatedAt: backdated },
        create: { cartId, variantId: variant.id, quantity: 1, updatedAt: backdated },
      });
    }
    abandonedCartsCreated += 1;
  }
  console.log(`  Abandoned carts: ${abandonedCartsCreated}`);

  // ── 10. Orders ──
  interface OrderPlanItem {
    n: number;
    status: OrderStatusT;
    paymentMethod: PaymentMethodT;
    daysAgo: number;
    couponCode: string | null;
    special?: "full-refund" | "partial-refund" | "cancel-refund" | "pending-return";
  }
  const orderPlan: OrderPlanItem[] = [
    // DELIVERED — 14 in the current 30-day window
    { n: 1, status: "DELIVERED", paymentMethod: "RAZORPAY", daysAgo: 28, couponCode: "DEMO-WELCOME10" },
    { n: 2, status: "DELIVERED", paymentMethod: "COD", daysAgo: 26, couponCode: null },
    { n: 3, status: "DELIVERED", paymentMethod: "RAZORPAY", daysAgo: 24, couponCode: null },
    { n: 4, status: "DELIVERED", paymentMethod: "RAZORPAY", daysAgo: 23, couponCode: "DEMO-AUTUMN15" },
    { n: 5, status: "DELIVERED", paymentMethod: "COD", daysAgo: 21, couponCode: null },
    { n: 6, status: "DELIVERED", paymentMethod: "RAZORPAY", daysAgo: 20, couponCode: null, special: "full-refund" },
    { n: 7, status: "DELIVERED", paymentMethod: "RAZORPAY", daysAgo: 18, couponCode: "DEMO-STYLE200" },
    { n: 8, status: "DELIVERED", paymentMethod: "COD", daysAgo: 17, couponCode: null },
    { n: 9, status: "DELIVERED", paymentMethod: "RAZORPAY", daysAgo: 16, couponCode: null },
    { n: 10, status: "DELIVERED", paymentMethod: "RAZORPAY", daysAgo: 14, couponCode: null, special: "partial-refund" },
    { n: 11, status: "DELIVERED", paymentMethod: "COD", daysAgo: 13, couponCode: null },
    { n: 12, status: "DELIVERED", paymentMethod: "RAZORPAY", daysAgo: 11, couponCode: "DEMO-WELCOME10" },
    { n: 13, status: "DELIVERED", paymentMethod: "RAZORPAY", daysAgo: 9, couponCode: null },
    { n: 14, status: "DELIVERED", paymentMethod: "COD", daysAgo: 7, couponCode: null, special: "pending-return" },
    // DELIVERED — 6 in the previous comparison window (31-58 days ago)
    { n: 15, status: "DELIVERED", paymentMethod: "RAZORPAY", daysAgo: 34, couponCode: null },
    { n: 16, status: "DELIVERED", paymentMethod: "COD", daysAgo: 38, couponCode: null },
    { n: 17, status: "DELIVERED", paymentMethod: "RAZORPAY", daysAgo: 42, couponCode: "DEMO-AUTUMN15" },
    { n: 18, status: "DELIVERED", paymentMethod: "COD", daysAgo: 46, couponCode: null },
    { n: 19, status: "DELIVERED", paymentMethod: "RAZORPAY", daysAgo: 50, couponCode: null },
    { n: 20, status: "DELIVERED", paymentMethod: "RAZORPAY", daysAgo: 55, couponCode: null },
    // CONFIRMED (4)
    { n: 21, status: "CONFIRMED", paymentMethod: "RAZORPAY", daysAgo: 2, couponCode: null },
    { n: 22, status: "CONFIRMED", paymentMethod: "COD", daysAgo: 1, couponCode: "DEMO-FIRSTORDER" },
    { n: 23, status: "CONFIRMED", paymentMethod: "RAZORPAY", daysAgo: 3, couponCode: null },
    { n: 24, status: "CONFIRMED", paymentMethod: "RAZORPAY", daysAgo: 1, couponCode: null },
    // PROCESSING (3)
    { n: 25, status: "PROCESSING", paymentMethod: "RAZORPAY", daysAgo: 2, couponCode: null },
    { n: 26, status: "PROCESSING", paymentMethod: "COD", daysAgo: 1, couponCode: null },
    { n: 27, status: "PROCESSING", paymentMethod: "RAZORPAY", daysAgo: 3, couponCode: "DEMO-WELCOME10" },
    // PACKED (3)
    { n: 28, status: "PACKED", paymentMethod: "RAZORPAY", daysAgo: 4, couponCode: null },
    { n: 29, status: "PACKED", paymentMethod: "COD", daysAgo: 3, couponCode: null },
    { n: 30, status: "PACKED", paymentMethod: "RAZORPAY", daysAgo: 5, couponCode: null },
    // SHIPPED (2)
    { n: 31, status: "SHIPPED", paymentMethod: "RAZORPAY", daysAgo: 4, couponCode: null },
    { n: 32, status: "SHIPPED", paymentMethod: "COD", daysAgo: 6, couponCode: null },
    // RETURNED_TO_ORIGIN (2) — 1 current, 1 previous window
    { n: 33, status: "RETURNED_TO_ORIGIN", paymentMethod: "RAZORPAY", daysAgo: 19, couponCode: null },
    { n: 34, status: "RETURNED_TO_ORIGIN", paymentMethod: "COD", daysAgo: 41, couponCode: null },
    // CANCELLED (1) — direct admin-cancellation refund
    { n: 35, status: "CANCELLED", paymentMethod: "RAZORPAY", daysAgo: 10, couponCode: null, special: "cancel-refund" },
    // PAYMENT_FAILED (1)
    { n: 36, status: "PAYMENT_FAILED", paymentMethod: "RAZORPAY", daysAgo: 5, couponCode: null },
  ];

  const createdOrders: { id: string; orderNumber: string; status: OrderStatusT; placedAt: Date; realized: boolean; totalPaise: number }[] = [];

  for (const plan of orderPlan) {
    const customer = customers[(plan.n * 3) % customers.length]!;
    const itemCount = 1 + (plan.n % 3);
    const lines: { product: (typeof products)[number]; variant: VariantRow; quantity: number }[] = [];
    for (let i = 0; i < itemCount; i++) {
      const product = products[(plan.n * 7 + i * 13) % products.length]!;
      const variant = product.variants[(plan.n + i) % product.variants.length]!;
      const quantity = plan.n % 5 === 0 && i === 0 ? 2 : 1;
      lines.push({ product, variant, quantity });
    }

    // Resolve offer + base/unit price per line.
    const prepared = lines.map(({ product, variant, quantity }) => {
      const basePricePaise = product.pricingMode === "FIXED" ? variant.fixedPricePaise! : calculateWeightBasedPricePaise(variant.weightGrams, ratePerKgPaise);
      const matched = resolveApplicableOffer(offers, { productId: product.id, categoryId: product.categoryId }, basePricePaise);
      const offerDiscountUnit = matched ? calculateOfferDiscount(matched, basePricePaise) : 0;
      const unitPricePaise = basePricePaise - offerDiscountUnit;
      const lineTotalPaise = unitPricePaise * quantity;
      return { product, variant, quantity, basePricePaise, unitPricePaise, lineTotalPaise, offer: matched, offerDiscountPaise: offerDiscountUnit * quantity };
    });

    const subtotalBeforeCoupon = prepared.reduce((s, p) => s + p.lineTotalPaise, 0);
    let discountPaise = 0;
    let allocation = new Map<string, number>();
    if (plan.couponCode) {
      const coupon = coupons.get(plan.couponCode)!;
      const meetsMin = coupon.minCartValuePaise == null || subtotalBeforeCoupon >= coupon.minCartValuePaise;
      if (meetsMin) {
        discountPaise = calculateCouponDiscount(coupon, subtotalBeforeCoupon);
        allocation = allocateCouponDiscount(discountPaise, prepared.map((p) => ({ variantId: p.variant.id, lineTotalPaise: p.lineTotalPaise })));
      }
    }

    const itemsData = prepared.map((p) => {
      const lineDiscount = allocation.get(p.variant.id) ?? 0;
      const ratePercent = resolveGstRatePercent(gstSlabs, p.unitPricePaise);
      const taxAmountPaise = applyPercentage(p.lineTotalPaise - lineDiscount, ratePercent);
      const unitCostPaiseSnapshot = computeUnitCostSnapshot({
        pricingMode: p.product.pricingMode,
        costPerKgPaise: p.product.costPerKgPaise,
        costPricePaise: p.variant.costPricePaise,
        weightGrams: p.variant.weightGrams,
      });
      return {
        variantId: p.variant.id,
        productNameSnapshot: p.product.name,
        skuSnapshot: p.variant.sku,
        color: p.variant.color,
        size: p.variant.size,
        weightGrams: p.variant.weightGrams,
        pricingMode: p.product.pricingMode as PricingMode,
        unitRatePerKgPaise: p.product.pricingMode === "WEIGHT_BASED" ? ratePerKgPaise : null,
        basePricePaise: p.basePricePaise,
        unitPricePaise: p.unitPricePaise,
        quantity: p.quantity,
        lineTotalPaise: p.lineTotalPaise,
        taxAmountPaise,
        discountPaise: lineDiscount,
        offerId: p.offer?.id ?? null,
        offerNameSnapshot: p.offer?.name ?? null,
        offerDiscountType: p.offer?.discountType ?? null,
        offerDiscountValue: p.offer?.discountValue ?? null,
        offerDiscountPaise: p.offerDiscountPaise,
        unitCostPaiseSnapshot,
      };
    });

    const subtotalPaise = itemsData.reduce((s, i) => s + i.lineTotalPaise, 0);
    const taxPaise = itemsData.reduce((s, i) => s + i.taxAmountPaise, 0);
    const totalWeightGrams = itemsData.reduce((s, i) => s + i.weightGrams * i.quantity, 0);
    const weightBasedTotalGrams = itemsData.filter((i) => i.unitRatePerKgPaise !== null).reduce((s, i) => s + i.weightGrams * i.quantity, 0);
    const shipping = resolveShippingEvaluation(weightBasedTotalGrams, shippingRule);
    const totalPaise = subtotalPaise + taxPaise + shipping.shippingFeePaise - discountPaise;

    const placedAt = daysAgo(plan.daysAgo);
    const orderNumber = `DEMO-ORD-${String(plan.n).padStart(4, "0")}`;
    const orderId = deterministicUuid(`demo-order-${String(plan.n).padStart(4, "0")}`);

    let shippedAt: Date | null = null;
    let deliveredAt: Date | null = null;
    let trackingNumber: string | null = null;
    let carrier: string | null = null;
    let cancelledAt: Date | null = null;
    let cancellationReason: string | null = null;
    if (["SHIPPED", "DELIVERED", "RETURNED_TO_ORIGIN"].includes(plan.status)) {
      shippedAt = new Date(placedAt.getTime() + randInt(1, 2) * 86400000);
      trackingNumber = `DEMOTRK${String(plan.n).padStart(6, "0")}`;
      carrier = "Woobe Logistics Partner";
    }
    if (plan.status === "DELIVERED") deliveredAt = new Date(shippedAt!.getTime() + randInt(2, 5) * 86400000);
    if (plan.status === "CANCELLED") {
      cancelledAt = new Date(placedAt.getTime() + randInt(1, 3) * 86400000);
      cancellationReason = "Customer requested cancellation";
    }

    let paymentStatus: "CREATED" | "PENDING" | "CAPTURED" | "FAILED" | "REFUNDED" = "PENDING";
    if (plan.paymentMethod === "RAZORPAY") {
      if (plan.status === "PAYMENT_FAILED") paymentStatus = "FAILED";
      else if (plan.status === "CANCELLED") paymentStatus = "REFUNDED";
      else if (plan.special === "full-refund") paymentStatus = "REFUNDED";
      else paymentStatus = "CAPTURED";
    } else {
      // COD
      if (plan.status === "DELIVERED") paymentStatus = "CAPTURED";
      else if (plan.status === "CANCELLED" || plan.status === "RETURNED_TO_ORIGIN") paymentStatus = "FAILED"; // never collected
      else paymentStatus = "PENDING";
    }

    const order = await prisma.order.upsert({
      where: { id: orderId },
      update: {
        status: plan.status as OrderStatusT,
        shippedAt,
        deliveredAt,
        cancelledAt,
        cancellationReason,
        trackingNumber,
        carrier,
        subtotalPaise,
        discountPaise,
        shippingFeePaise: shipping.shippingFeePaise,
        taxPaise,
        totalPaise,
        totalWeightGrams,
        placedAt,
      },
      create: {
        id: orderId,
        orderNumber,
        userId: customer.id,
        status: plan.status as OrderStatusT,
        addressId: customer.addressId,
        contactName: customer.name,
        contactPhone: customer.phone,
        contactEmail: customer.email,
        shippingSnapshot: { fullName: customer.name, phone: customer.phone, line1: "Demo address", city: customer.city, state: customer.state, pincode: customer.pincode },
        subtotalPaise,
        discountPaise,
        shippingFeePaise: shipping.shippingFeePaise,
        taxPaise,
        totalPaise,
        totalWeightGrams,
        paymentMethod: plan.paymentMethod,
        placedAt,
        shippedAt,
        deliveredAt,
        cancelledAt,
        cancellationReason,
        trackingNumber,
        carrier,
      },
    });

    // Deterministic per-item ids (not the default uuid) so a re-run upserts
    // the SAME OrderItem rows instead of deleting and recreating them — a
    // delete+recreate would break the orderId FK that ReturnItem rows (see
    // below) hold onto a specific OrderItem across runs.
    const currentItems: ((typeof itemsData)[number] & { id: string })[] = [];
    for (const [idx, item] of itemsData.entries()) {
      const itemId = deterministicUuid(`demo-order-${String(plan.n).padStart(4, "0")}-item-${idx}`);
      const row = await prisma.orderItem.upsert({
        where: { id: itemId },
        update: item,
        create: { id: itemId, orderId: order.id, ...item },
      });
      currentItems.push(row);
    }
    // A re-run with fewer items than before (order plan edited) must not
    // leave orphaned extra rows.
    await prisma.orderItem.deleteMany({ where: { orderId: order.id, id: { notIn: currentItems.map((i) => i.id) } } });

    const paymentId = `demo-payment-${String(plan.n).padStart(4, "0")}`;
    await prisma.payment.upsert({
      where: { id: paymentId },
      update: { status: paymentStatus, amountPaise: totalPaise },
      create: {
        id: paymentId,
        orderId: order.id,
        provider: plan.paymentMethod,
        status: paymentStatus,
        amountPaise: totalPaise,
        razorpayOrderId: plan.paymentMethod === "RAZORPAY" ? `order_demo${String(plan.n).padStart(8, "0")}` : null,
        razorpayPaymentId: plan.paymentMethod === "RAZORPAY" && paymentStatus !== "FAILED" ? `pay_demo${String(plan.n).padStart(8, "0")}` : null,
      },
    });

    if (plan.couponCode && discountPaise > 0) {
      const redemptionId = `demo-redemption-${String(plan.n).padStart(4, "0")}`;
      await prisma.couponRedemption.upsert({
        where: { orderId: order.id },
        update: {},
        create: { id: redemptionId, couponId: (await prisma.coupon.findUniqueOrThrow({ where: { code: plan.couponCode } })).id, userId: customer.id, orderId: order.id },
      });
    }

    // Returns / refunds for the flagged orders.
    if (plan.special === "full-refund" || plan.special === "partial-refund" || plan.special === "pending-return") {
      const returnId = `demo-return-${String(plan.n).padStart(4, "0")}`;
      const returnStatus = plan.special === "pending-return" ? "RETURN_REQUESTED" : "REFUNDED";
      await prisma.return.upsert({
        where: { id: returnId },
        update: { status: returnStatus },
        create: { id: returnId, orderId: order.id, status: returnStatus, reason: "Item did not fit as expected" },
      });
      if (plan.special !== "pending-return") {
        const returnedItems = plan.special === "full-refund" ? currentItems : currentItems.slice(0, 1);
        for (const [idx, item] of returnedItems.entries()) {
          await prisma.returnItem.upsert({
            where: { id: `${returnId}-item-${idx}` },
            update: { quantity: item.quantity },
            create: { id: `${returnId}-item-${idx}`, returnId, orderItemId: item.id, quantity: item.quantity },
          });
        }
        const refundAmount = returnedItems.reduce((s, i) => s + (i.lineTotalPaise - i.discountPaise) + i.taxAmountPaise, 0);
        await prisma.refund.upsert({
          where: { returnId },
          update: { amountPaise: refundAmount, status: "COMPLETED" },
          create: { id: `demo-refund-${String(plan.n).padStart(4, "0")}`, returnId, orderId: order.id, provider: plan.paymentMethod, status: "COMPLETED", amountPaise: refundAmount },
        });
      }
    }
    if (plan.special === "cancel-refund") {
      await prisma.refund.upsert({
        where: { id: `demo-refund-${String(plan.n).padStart(4, "0")}` },
        update: { amountPaise: totalPaise, status: "COMPLETED" },
        create: { id: `demo-refund-${String(plan.n).padStart(4, "0")}`, returnId: null, orderId: order.id, provider: plan.paymentMethod, status: "COMPLETED", amountPaise: totalPaise },
      });
    }

    // WebhookEvent for a captured/refunded RAZORPAY payment (feeds the payments panel's success count).
    if (plan.paymentMethod === "RAZORPAY" && (paymentStatus === "CAPTURED" || paymentStatus === "REFUNDED")) {
      const eventId = `demo-evt-captured-${String(plan.n).padStart(4, "0")}`;
      await prisma.webhookEvent.upsert({
        where: { provider_eventId: { provider: "razorpay", eventId } },
        update: {},
        create: {
          id: `demo-webhook-captured-${String(plan.n).padStart(4, "0")}`,
          provider: "razorpay",
          eventType: "payment.captured",
          eventId,
          payload: { event: "payment.captured", payload: { payment: { entity: { id: `pay_demo${String(plan.n).padStart(8, "0")}`, amount: totalPaise, status: "captured" } } } },
          createdAt: new Date(placedAt.getTime() + randInt(1, 20) * 60000),
          processedAt: new Date(placedAt.getTime() + randInt(21, 40) * 60000),
        },
      });
    }
    if (plan.paymentMethod === "RAZORPAY" && paymentStatus === "FAILED") {
      const eventId = `demo-evt-failed-order-${String(plan.n).padStart(4, "0")}`;
      await prisma.webhookEvent.upsert({
        where: { provider_eventId: { provider: "razorpay", eventId } },
        update: {},
        create: {
          id: `demo-webhook-failed-order-${String(plan.n).padStart(4, "0")}`,
          provider: "razorpay",
          eventType: "payment.failed",
          eventId,
          payload: {
            event: "payment.failed",
            payload: { payment: { entity: { id: `pay_demofail${String(plan.n).padStart(6, "0")}`, amount: totalPaise, error_code: "GATEWAY_ERROR", error_reason: "payment_declined", error_description: "Payment was declined by the bank" } } },
          },
          createdAt: new Date(placedAt.getTime() + randInt(1, 20) * 60000),
        },
      });
    }

    createdOrders.push({ id: order.id, orderNumber, status: plan.status, placedAt, realized: !["PENDING_PAYMENT", "PAYMENT_FAILED", "CANCELLED"].includes(plan.status), totalPaise });
  }
  console.log(`  Orders: ${orderPlan.length}`);

  // ── 11. Standalone failed-payment webhook events (checkout attempts that never produced an order) ──
  const standaloneFailures: { reasonCode: string; reason: string; description: string }[] = [
    { reasonCode: "BAD_REQUEST_ERROR", reason: "insufficient_funds", description: "Insufficient balance in the customer's account" },
    { reasonCode: "GATEWAY_ERROR", reason: "payment_declined", description: "Payment declined by the issuing bank" },
    { reasonCode: "BAD_REQUEST_ERROR", reason: "authentication_failed", description: "3-D Secure authentication failed" },
    { reasonCode: "SERVER_ERROR", reason: "network_error", description: "Gateway timed out while processing the request" },
    { reasonCode: "GATEWAY_ERROR", reason: "payment_cancelled", description: "Payment cancelled by the customer" },
    { reasonCode: "BAD_REQUEST_ERROR", reason: "card_declined", description: "Card declined — do not honour" },
  ];
  for (const [i, f] of standaloneFailures.entries()) {
    const eventId = `demo-evt-failed-standalone-${String(i + 1).padStart(2, "0")}`;
    const createdAt = daysAgo(randInt(1, 27));
    await prisma.webhookEvent.upsert({
      where: { provider_eventId: { provider: "razorpay", eventId } },
      update: {},
      create: {
        id: `demo-webhook-failed-standalone-${String(i + 1).padStart(2, "0")}`,
        provider: "razorpay",
        eventType: "payment.failed",
        eventId,
        payload: { event: "payment.failed", payload: { payment: { entity: { id: `pay_demoattempt${String(i + 1).padStart(4, "0")}`, amount: randInt(50000, 300000), error_code: f.reasonCode, error_reason: f.reason, error_description: f.description } } } },
        createdAt,
      },
    });
  }
  console.log(`  Standalone failed-payment events: ${standaloneFailures.length}`);

  // ── 12. Analytics funnel sessions ──
  type SessionArchetype = "view-only" | "abandoned-cart" | "checkout-no-order" | "paid";
  interface SessionPlan {
    sessionId: string;
    createdAt: Date;
    archetype: SessionArchetype;
    productIds: string[];
  }
  function buildSessions(windowLabel: "current" | "previous", counts: Record<SessionArchetype, number>, maxDaysAgo: number, minDaysAgo: number): SessionPlan[] {
    const plans: SessionPlan[] = [];
    let idx = 0;
    for (const archetype of ["view-only", "abandoned-cart", "checkout-no-order", "paid"] as SessionArchetype[]) {
      for (let i = 0; i < counts[archetype]; i++) {
        idx += 1;
        const sessionId = `demo-session-${windowLabel}-${String(idx).padStart(4, "0")}`;
        const createdAt = daysAgo(minDaysAgo + ((idx * 7) % (maxDaysAgo - minDaysAgo + 1)));
        const productIds = [products[(idx * 11) % products.length]!.id, products[(idx * 17 + 3) % products.length]!.id];
        plans.push({ sessionId, createdAt, archetype, productIds });
      }
    }
    return plans;
  }

  const currentSessions = buildSessions("current", { "view-only": 90, "abandoned-cart": 45, "checkout-no-order": 18, paid: 27 }, 29, 0);
  const previousSessions = buildSessions("previous", { "view-only": 65, "abandoned-cart": 32, "checkout-no-order": 12, paid: 18 }, 58, 31);
  const allSessions = [...currentSessions, ...previousSessions];

  // Link "paid" current-window sessions to real realized demo orders placed in the current window.
  const linkableOrders = createdOrders.filter((o) => o.realized && o.placedAt.getTime() >= daysAgo(29).getTime() - 86400000);
  const paidCurrentSessions = currentSessions.filter((s) => s.archetype === "paid");
  const linkCount = Math.min(linkableOrders.length, paidCurrentSessions.length);
  for (let i = 0; i < linkCount; i++) {
    await prisma.order.update({ where: { id: linkableOrders[i]!.id }, data: { analyticsSessionId: paidCurrentSessions[i]!.sessionId } });
  }

  const eventRows: { id?: string; type: "SESSION_STARTED" | "PRODUCT_VIEWED" | "CART_ADDED" | "CHECKOUT_STARTED"; sessionId: string; dedupeKey: string; productId: string | null; createdAt: Date }[] = [];
  for (const s of allSessions) {
    eventRows.push({ type: "SESSION_STARTED", sessionId: s.sessionId, dedupeKey: "once", productId: null, createdAt: s.createdAt });
    if (s.archetype === "view-only") {
      eventRows.push({ type: "PRODUCT_VIEWED", sessionId: s.sessionId, dedupeKey: s.productIds[0]!, productId: s.productIds[0]!, createdAt: new Date(s.createdAt.getTime() + 60000) });
    }
    if (s.archetype === "abandoned-cart" || s.archetype === "checkout-no-order" || s.archetype === "paid") {
      for (const [i, pid] of s.productIds.entries()) {
        eventRows.push({ type: "PRODUCT_VIEWED", sessionId: s.sessionId, dedupeKey: pid, productId: pid, createdAt: new Date(s.createdAt.getTime() + (i + 1) * 60000) });
      }
      eventRows.push({ type: "CART_ADDED", sessionId: s.sessionId, dedupeKey: "once", productId: null, createdAt: new Date(s.createdAt.getTime() + 4 * 60000) });
    }
    if (s.archetype === "checkout-no-order" || s.archetype === "paid") {
      eventRows.push({ type: "CHECKOUT_STARTED", sessionId: s.sessionId, dedupeKey: "once", productId: null, createdAt: new Date(s.createdAt.getTime() + 6 * 60000) });
    }
  }

  // Idempotent re-run: clear this run's demo sessions' events first, then bulk-insert (cheaper than per-row upserts for ~1k rows).
  await prisma.analyticsEvent.deleteMany({ where: { sessionId: { startsWith: "demo-session-" } } });
  await prisma.analyticsEvent.createMany({ data: eventRows.map((e) => ({ type: e.type, sessionId: e.sessionId, dedupeKey: e.dedupeKey, productId: e.productId, createdAt: e.createdAt })) });
  console.log(`  Analytics sessions: ${allSessions.length} (${eventRows.length} events) — ${linkCount} linked to real orders`);

  // ── 13. Testimonials (no images — deferred to admin upload) ──
  const testimonialDefs = [
    { orderIdx: 1, rating: 5, text: "The fit was spot on and it arrived faster than I expected. Already eyeing my next order." },
    { orderIdx: 3, rating: 4, text: "Lovely fabric, true to the photos. Packaging was neat too." },
    { orderIdx: 5, rating: 5, text: "This is my third order and every piece has held up well after washing." },
    { orderIdx: 9, rating: 3, text: "Good quality overall, though I'd size up next time — runs a little snug." },
    { orderIdx: 12, rating: 5, text: "Exactly what I needed for the season. The weight-based pricing makes total sense once you see the fabric quality." },
    { orderIdx: 17, rating: 4, text: "Delivery took a couple of days longer than expected but the product itself was worth the wait." },
  ];
  let testimonialsCreated = 0;
  for (const t of testimonialDefs) {
    const orderPlanEntry = orderPlan.find((o) => o.n === t.orderIdx)!;
    const orderId = deterministicUuid(`demo-order-${String(orderPlanEntry.n).padStart(4, "0")}`);
    const customer = customers[(orderPlanEntry.n * 3) % customers.length]!;
    await prisma.testimonial.upsert({
      where: { orderId },
      update: { rating: t.rating, text: t.text, status: "APPROVED" },
      create: { id: `demo-testimonial-${String(orderPlanEntry.n).padStart(4, "0")}`, orderId, customerId: customer.id, rating: t.rating, text: t.text, status: "APPROVED" },
    });
    testimonialsCreated += 1;
  }
  console.log(`  Testimonials: ${testimonialsCreated}`);

  console.log("\nDemo dataset seed complete.");
  console.log("Banners: none created — Banner.imageUrl is a required (non-nullable) column, so no schema-valid Banner row exists without either a real image or a fabricated placeholder URL. See the final report for options.");
}

main()
  .catch((e) => {
    console.error("Demo seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
