import bcrypt from "bcryptjs";
import { AuthMethod, PrismaClient, Role } from "../generated/client";

const prisma = new PrismaClient();

/** Mirrors packages/utils' calculateWeightBasedPricePaise — duplicated here
 * (not imported) so the seed script has zero workspace dependencies beyond
 * @prisma/client, keeping `pnpm --filter @woobe/database run seed` fast and
 * self-contained. */
function priceForWeight(weightGrams: number, ratePerKgPaise: number): number {
  return Math.round((weightGrams * ratePerKgPaise) / 1000);
}

// Placeholder — see DECISIONS_PENDING.md #3. Real catalogue pricing pending client input.
const DEFAULT_RATE_PER_KG_PAISE = 120_000; // ₹1,200/kg

async function main() {
  console.log("Seeding Woobe database...");

  // ── Warehouse (ADR-015: single warehouse at launch) ──
  const warehouse = await prisma.warehouse.upsert({
    where: { code: "WH-MAIN" },
    update: {},
    create: {
      code: "WH-MAIN",
      name: "Woobe Main Warehouse",
      line1: "Plot 42, Industrial Layout",
      city: "Bengaluru",
      state: "Karnataka",
      pincode: "560058",
    },
  });

  // ── Pricing & shipping settings ──
  await prisma.pricingSetting.create({
    data: { defaultRatePerKgPaise: DEFAULT_RATE_PER_KG_PAISE },
  });

  await prisma.shippingRule.create({
    data: {
      minWeightGramsForCheckout: 1000,
      freeDeliveryThresholdGrams: 1500,
      standardFeePaise: 5_000, // ₹50 — placeholder, see DECISIONS_PENDING.md #2
    },
  });

  // ── GST slabs (ADR-023) — tiered by per-piece price, matches India's
  // GST structure effective since the September 2025 reform. ──
  await prisma.gstSlab.create({ data: { maxPricePaise: 250_000, ratePercent: 5 } }); // <= ₹2,500
  await prisma.gstSlab.create({ data: { maxPricePaise: null, ratePercent: 18 } }); // above ₹2,500, unbounded

  // ── Admin user (ADR-018) ──
  const adminPasswordHash = await bcrypt.hash("Admin@12345", 12);
  await prisma.user.upsert({
    where: { email: "admin@woobe.in" },
    // ADR-024 / PRE_DAY4_PATCH.md #3: migrates the already-seeded admin
    // user (previously role: ADMIN) to SUPER_ADMIN on re-run, not just on
    // first create — this is the data-migration step for existing rows.
    update: { role: Role.SUPER_ADMIN },
    create: {
      email: "admin@woobe.in",
      name: "Woobe Admin",
      role: Role.SUPER_ADMIN,
      authCredentials: {
        create: { method: AuthMethod.PASSWORD, passwordHash: adminPasswordHash },
      },
    },
  });
  console.log("  Admin user: admin@woobe.in / Admin@12345 (dev only — never a real password)");

  // ── Staff demo accounts (ADR-024/025) — lets RBAC boundaries actually be
  // exercised in the browser, not just verified by reading permissions.ts. ──
  const staffPasswordHash = await bcrypt.hash("Staff@12345", 12);
  await prisma.user.upsert({
    where: { email: "orders@woobe.in" },
    update: { role: Role.ORDER_PROCESSING_STAFF },
    create: {
      email: "orders@woobe.in",
      name: "Order Processing Staff",
      role: Role.ORDER_PROCESSING_STAFF,
      authCredentials: { create: { method: AuthMethod.PASSWORD, passwordHash: staffPasswordHash } },
    },
  });
  await prisma.user.upsert({
    where: { email: "catalog@woobe.in" },
    update: { role: Role.PRODUCT_MANAGEMENT_STAFF },
    create: {
      email: "catalog@woobe.in",
      name: "Product Management Staff",
      role: Role.PRODUCT_MANAGEMENT_STAFF,
      authCredentials: { create: { method: AuthMethod.PASSWORD, passwordHash: staffPasswordHash } },
    },
  });
  console.log("  Staff users: orders@woobe.in / catalog@woobe.in — password Staff@12345 (dev only)");

  // ── Categories ──
  const categoryDefs = [
    { name: "Tops", slug: "tops" },
    { name: "Dresses", slug: "dresses" },
    { name: "Bottoms", slug: "bottoms" },
    { name: "Ethnic Wear", slug: "ethnic-wear" },
    { name: "Accessories", slug: "accessories" },
  ];
  const categories: Record<string, { id: string }> = {};
  for (const c of categoryDefs) {
    categories[c.slug] = await prisma.category.upsert({
      where: { slug: c.slug },
      update: {},
      create: c,
    });
  }

  // ── Collections ──
  const newDrops = await prisma.collection.upsert({
    where: { slug: "new-drops" },
    update: {},
    create: { name: "New Drops", slug: "new-drops", description: "Freshly landed this week" },
  });
  const mostLoved = await prisma.collection.upsert({
    where: { slug: "most-loved" },
    update: {},
    create: { name: "Most Loved", slug: "most-loved", description: "Customer favourites" },
  });

  // ── Demo products (8-10, with variants + stock) ──
  type VariantDef = { color: string; size: string; weightGrams: number; stock: number };
  type ProductDef = {
    name: string;
    slug: string;
    description: string;
    categorySlug: string;
    collections: string[];
    variants: VariantDef[];
  };

  const productDefs: ProductDef[] = [
    {
      name: "Floral Wrap Dress",
      slug: "floral-wrap-dress",
      description: "Lightweight floral wrap dress with a flattering tie waist.",
      categorySlug: "dresses",
      collections: ["new-drops"],
      variants: [
        { color: "Rose", size: "S", weightGrams: 320, stock: 25 },
        { color: "Rose", size: "M", weightGrams: 340, stock: 30 },
        { color: "Sage", size: "M", weightGrams: 340, stock: 18 },
      ],
    },
    {
      name: "Linen Co-ord Set",
      slug: "linen-coord-set",
      description: "Breathable linen top and trouser co-ord set, perfect for warm days.",
      categorySlug: "tops",
      collections: ["new-drops", "most-loved"],
      variants: [
        { color: "Ivory", size: "S", weightGrams: 480, stock: 20 },
        { color: "Ivory", size: "M", weightGrams: 500, stock: 22 },
        { color: "Terracotta", size: "M", weightGrams: 500, stock: 15 },
      ],
    },
    {
      name: "Denim Jacket",
      slug: "denim-jacket",
      description: "Classic cropped denim jacket with contrast stitching.",
      categorySlug: "tops",
      collections: ["most-loved"],
      variants: [
        { color: "Indigo", size: "M", weightGrams: 620, stock: 20 },
        { color: "Indigo", size: "L", weightGrams: 650, stock: 16 },
      ],
    },
    {
      name: "Silk Scarf",
      slug: "silk-scarf",
      description: "Hand-finished mulberry silk scarf with a hand-rolled edge.",
      categorySlug: "accessories",
      collections: ["new-drops"],
      variants: [
        { color: "Blush", size: "One Size", weightGrams: 60, stock: 40 },
        { color: "Charcoal", size: "One Size", weightGrams: 60, stock: 35 },
      ],
    },
    {
      name: "Cotton Kurta",
      slug: "cotton-kurta",
      description: "Hand block-printed cotton kurta, breathable everyday ethnic wear.",
      categorySlug: "ethnic-wear",
      collections: ["most-loved"],
      variants: [
        { color: "Mustard", size: "S", weightGrams: 280, stock: 24 },
        { color: "Mustard", size: "M", weightGrams: 300, stock: 28 },
        { color: "Teal", size: "M", weightGrams: 300, stock: 20 },
      ],
    },
    {
      name: "Pleated Midi Skirt",
      slug: "pleated-midi-skirt",
      description: "Fluid pleated midi skirt that moves with you.",
      categorySlug: "bottoms",
      collections: ["new-drops"],
      variants: [
        { color: "Dusty Rose", size: "S", weightGrams: 260, stock: 18 },
        { color: "Dusty Rose", size: "M", weightGrams: 280, stock: 22 },
      ],
    },
    {
      name: "Embroidered Top",
      slug: "embroidered-top",
      description: "Delicately embroidered cotton top with a relaxed silhouette.",
      categorySlug: "tops",
      collections: [],
      variants: [
        { color: "White", size: "S", weightGrams: 220, stock: 20 },
        { color: "White", size: "M", weightGrams: 230, stock: 20 },
      ],
    },
    {
      name: "Palazzo Pants",
      slug: "palazzo-pants",
      description: "Wide-leg palazzo pants in flowy rayon.",
      categorySlug: "bottoms",
      collections: ["most-loved"],
      variants: [
        { color: "Olive", size: "M", weightGrams: 310, stock: 24 },
        { color: "Olive", size: "L", weightGrams: 330, stock: 18 },
      ],
    },
    {
      name: "Woven Tote Bag",
      slug: "woven-tote-bag",
      description: "Hand-woven jute tote with a leather-trimmed handle.",
      categorySlug: "accessories",
      collections: ["new-drops"],
      variants: [{ color: "Natural", size: "One Size", weightGrams: 380, stock: 30 }],
    },
    {
      name: "Statement Earrings",
      slug: "statement-earrings",
      description: "Handcrafted brass statement earrings with a matte finish.",
      categorySlug: "accessories",
      collections: [],
      variants: [
        { color: "Gold", size: "One Size", weightGrams: 25, stock: 50 },
        { color: "Silver", size: "One Size", weightGrams: 25, stock: 45 },
      ],
    },
  ];

  for (const p of productDefs) {
    const variantPrices = p.variants.map((v) => priceForWeight(v.weightGrams, DEFAULT_RATE_PER_KG_PAISE));
    const minPrice = Math.min(...variantPrices);

    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      update: {},
      create: {
        name: p.name,
        slug: p.slug,
        description: p.description,
        categoryId: categories[p.categorySlug]!.id,
        minPricePaiseCache: minPrice,
        images: {
          create: [
            {
              url: `https://placehold.co/800x1000?text=${encodeURIComponent(p.name)}`,
              altText: p.name,
              sortOrder: 0,
            },
          ],
        },
        collections: {
          create: p.collections.map((slug) => ({
            collection: { connect: { id: slug === "new-drops" ? newDrops.id : mostLoved.id } },
          })),
        },
      },
    });

    for (const v of p.variants) {
      const sku = `${p.slug}-${v.color}-${v.size}`.toUpperCase().replace(/\s+/g, "-");
      const effectivePrice = priceForWeight(v.weightGrams, DEFAULT_RATE_PER_KG_PAISE);

      const variant = await prisma.productVariant.upsert({
        where: { sku },
        update: {},
        create: {
          productId: product.id,
          sku,
          color: v.color,
          size: v.size,
          weightGrams: v.weightGrams,
          effectivePricePaiseCache: effectivePrice,
        },
      });

      await prisma.inventory.upsert({
        where: { variantId_warehouseId: { variantId: variant.id, warehouseId: warehouse.id } },
        update: { quantityAvailable: v.stock },
        create: {
          variantId: variant.id,
          warehouseId: warehouse.id,
          quantityAvailable: v.stock,
          quantityReserved: 0,
        },
      });
    }
  }

  console.log(`  Seeded ${productDefs.length} products with variants + inventory.`);

  // ── Demo coupons (week2 (1).md §9) — no admin CRUD exists for coupons
  // this week (coupons.module.ts's own doc comment), so this seed script is
  // the only path that creates them. One of each rule shape, so every
  // branch of resolveCouponEligibility has a real, usable code to test with. ──
  const farFuture = new Date("2999-01-01");
  const longPast = new Date("2020-01-01");

  await prisma.coupon.upsert({
    where: { code: "WELCOME10" },
    update: {},
    create: {
      code: "WELCOME10",
      type: "PERCENTAGE",
      value: 10,
      perUserLimit: 1,
      validFrom: longPast,
      validTo: farFuture,
    },
  });

  await prisma.coupon.upsert({
    where: { code: "FLAT200" },
    update: {},
    create: {
      code: "FLAT200",
      type: "FLAT",
      value: 20_000, // ₹200
      minCartValuePaise: 1_000_00, // ₹1,000
      usageLimit: 100,
      validFrom: longPast,
      validTo: farFuture,
    },
  });

  const scarf = await prisma.product.findUnique({ where: { slug: "silk-scarf" } });
  if (scarf) {
    await prisma.coupon.upsert({
      where: { code: "SCARF15" },
      update: {},
      create: {
        code: "SCARF15",
        type: "PERCENTAGE",
        value: 15,
        validFrom: longPast,
        validTo: farFuture,
        products: { create: { productId: scarf.id } },
      },
    });
  }

  await prisma.coupon.upsert({
    where: { code: "ACCESSORIES20" },
    update: {},
    create: {
      code: "ACCESSORIES20",
      type: "PERCENTAGE",
      value: 20,
      maxDiscountPaise: 500_00, // ₹500 cap
      validFrom: longPast,
      validTo: farFuture,
      categories: { create: { categoryId: categories["accessories"]!.id } },
    },
  });

  console.log("  Demo coupons: WELCOME10 (10% off, once per customer), FLAT200 (₹200 off ₹1,000+), SCARF15 (15% off the Silk Scarf), ACCESSORIES20 (20% off Accessories, capped at ₹500).");
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
