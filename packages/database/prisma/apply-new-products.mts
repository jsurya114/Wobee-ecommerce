/**
 * One-off, idempotent apply of the "Ladies range, batch 2" products to an
 * already-seeded database (running the full `db:seed` against a non-empty DB
 * duplicates the non-idempotent PricingSetting/ShippingRule/GstSlab rows).
 *
 *   pnpm --filter @woobe/database exec tsx prisma/apply-new-products.mts
 *
 * The canonical definition of these products lives in `seed.ts`; this file
 * mirrors its per-product upsert loop for just the new entries so a fresh
 * `db:seed` and an existing dev/prod DB converge on the same rows. Safe to
 * re-run.
 */
import { PrismaClient } from "../generated/client";

const prisma = new PrismaClient();
const DEFAULT_RATE_PER_KG_PAISE = 120_000;
const priceForWeight = (g: number, rate: number) => Math.round((g * rate) / 1000);

type VariantDef = { color: string; size: string; weightGrams: number; stock: number };
type ProductDef = {
  name: string;
  slug: string;
  description: string;
  categorySlug: string;
  collections: string[];
  image: string;
  variants: VariantDef[];
};

const productDefs: ProductDef[] = [
  {
    name: "Oxidised Jhumka Earrings",
    slug: "oxidised-jhumka-earrings",
    description: "Traditional dome jhumkas in oxidised silver-tone metal with fine ghungroo detailing.",
    categorySlug: "accessories",
    collections: ["new-drops"],
    image: "/imgs/prod-oxidised-jhumka-earrings.jpg",
    variants: [
      { color: "Oxidised Silver", size: "One Size", weightGrams: 32, stock: 60 },
      { color: "Antique Gold", size: "One Size", weightGrams: 32, stock: 40 },
    ],
  },
  {
    name: "Quilted Crossbody Bag",
    slug: "quilted-crossbody-bag",
    description: "Compact quilted crossbody with an adjustable chain strap and a magnetic flap.",
    categorySlug: "accessories",
    collections: ["most-loved"],
    image: "/imgs/prod-quilted-crossbody-bag.jpg",
    variants: [
      { color: "Black", size: "One Size", weightGrams: 340, stock: 35 },
      { color: "Tan", size: "One Size", weightGrams: 340, stock: 28 },
    ],
  },
  {
    name: "Kolhapuri Leather Sandals",
    slug: "kolhapuri-leather-sandals",
    description: "Hand-stitched tan leather Kolhapuri sandals with a cushioned footbed.",
    categorySlug: "accessories",
    collections: ["new-drops"],
    image: "/imgs/prod-kolhapuri-leather-sandals.jpg",
    variants: [
      { color: "Tan", size: "37", weightGrams: 400, stock: 20 },
      { color: "Tan", size: "38", weightGrams: 420, stock: 24 },
      { color: "Tan", size: "39", weightGrams: 440, stock: 18 },
    ],
  },
  {
    name: "Enamel Bangle Set",
    slug: "enamel-bangle-set",
    description: "Set of four slim enamel bangles with a hand-painted floral motif.",
    categorySlug: "accessories",
    collections: [],
    image: "/imgs/prod-enamel-bangle-set.jpg",
    variants: [
      { color: "Rose", size: "2.4", weightGrams: 110, stock: 30 },
      { color: "Rose", size: "2.6", weightGrams: 120, stock: 34 },
      { color: "Teal", size: "2.6", weightGrams: 120, stock: 26 },
    ],
  },
  {
    name: "Ribbed Knit Sweater",
    slug: "ribbed-knit-sweater",
    description: "Soft ribbed-knit sweater with a relaxed fit and drop shoulders.",
    categorySlug: "tops",
    collections: ["new-drops", "most-loved"],
    image: "/imgs/prod-ribbed-knit-sweater.jpg",
    variants: [
      { color: "Oatmeal", size: "S", weightGrams: 360, stock: 26 },
      { color: "Oatmeal", size: "M", weightGrams: 380, stock: 30 },
      { color: "Rust", size: "M", weightGrams: 380, stock: 22 },
      { color: "Rust", size: "L", weightGrams: 400, stock: 18 },
    ],
  },
];

async function main() {
  const warehouse = await prisma.warehouse.findUniqueOrThrow({ where: { code: "WH-MAIN" } });
  const categoriesBySlug = new Map((await prisma.category.findMany()).map((c) => [c.slug, c.id]));
  const collectionsBySlug = new Map((await prisma.collection.findMany()).map((c) => [c.slug, c.id]));

  for (const p of productDefs) {
    const minPrice = Math.min(...p.variants.map((v) => priceForWeight(v.weightGrams, DEFAULT_RATE_PER_KG_PAISE)));
    const categoryId = categoriesBySlug.get(p.categorySlug);
    if (!categoryId) throw new Error(`Unknown category slug: ${p.categorySlug}`);

    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      update: { description: p.description, categoryId, minPricePaiseCache: minPrice },
      create: { name: p.name, slug: p.slug, description: p.description, categoryId, minPricePaiseCache: minPrice },
    });

    // Collections (idempotent join rows).
    await prisma.productCollection.deleteMany({ where: { productId: product.id } });
    for (const slug of p.collections) {
      const collectionId = collectionsBySlug.get(slug);
      if (collectionId) {
        await prisma.productCollection.create({ data: { productId: product.id, collectionId } });
      }
    }

    // Single real image.
    await prisma.productImage.deleteMany({ where: { productId: product.id } });
    await prisma.productImage.create({ data: { productId: product.id, url: p.image, altText: p.name, sortOrder: 0 } });

    for (const v of p.variants) {
      const sku = `${p.slug}-${v.color}-${v.size}`.toUpperCase().replace(/\s+/g, "-");
      const effectivePrice = priceForWeight(v.weightGrams, DEFAULT_RATE_PER_KG_PAISE);
      const variant = await prisma.productVariant.upsert({
        where: { sku },
        update: { color: v.color, size: v.size, weightGrams: v.weightGrams, effectivePricePaiseCache: effectivePrice, isActive: true },
        create: { productId: product.id, sku, color: v.color, size: v.size, weightGrams: v.weightGrams, effectivePricePaiseCache: effectivePrice },
      });
      await prisma.inventory.upsert({
        where: { variantId_warehouseId: { variantId: variant.id, warehouseId: warehouse.id } },
        update: { quantityAvailable: v.stock },
        create: { variantId: variant.id, warehouseId: warehouse.id, quantityAvailable: v.stock, quantityReserved: 0 },
      });
    }

    console.log(`  ✓ ${p.name} (${p.variants.length} variants, from ₹${(minPrice / 100).toFixed(2)})`);
  }
}

main()
  .then(() => console.log("Done."))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
