import { createHash } from "node:crypto";
import { PrismaClient } from "../generated/client";

const prisma = new PrismaClient();

/**
 * Deletes ONLY the presentation/demo dataset created by demo-seed.ts.
 * Nothing here touches real customers, orders, products, or the baseline
 * Warehouse/PricingSetting/ShippingRule/GstSlab rows (those are never
 * demo-namespaced, so no filter below can ever match them).
 *
 * Most demo rows are identified by a `demo-`/`DEMO-` prefix on a
 * human-readable field (slug, sku, code, orderNumber, email, id). Category,
 * Product, ProductVariant, Collection, Offer, Order and OrderItem are the
 * exception — demo-seed.ts gives those a deterministic-but-real UUID `id`
 * (several live customer flows reject a non-UUID id with a 400), so they're
 * found here via their own prefixed natural field (slug/sku/orderNumber) or,
 * for Offer (no natural unique field), by recomputing the same 4 known
 * deterministic ids demo-seed.ts derives them from.
 *
 * Safety: running with no flags only COUNTS what would be deleted and exits.
 * Pass --confirm to actually delete.
 */

const DEMO_ID = "demo-";
const startsWithDemo = { startsWith: DEMO_ID };
const demoSlug = { startsWith: "demo-" };
const demoSku = { startsWith: "DEMO-" };
const demoOrderNumber = { startsWith: "DEMO-ORD-" };
const demoEmail = { endsWith: "@example.com" };

// Mirrors demo-seed.ts's own deterministicUuid() exactly — must stay in sync.
const DEMO_UUID_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
function deterministicUuid(key: string): string {
  const namespaceBytes = Buffer.from(DEMO_UUID_NAMESPACE.replace(/-/g, ""), "hex");
  const hash = createHash("sha1").update(namespaceBytes).update(Buffer.from(key, "utf8")).digest();
  const bytes = hash.subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
// The 4 offer keys demo-seed.ts creates — see its offerDefs list.
const DEMO_OFFER_IDS = ["sitewide10", "tops15", "ethnic200off", "spotlight20"].map((key) => deterministicUuid(`demo-offer-${key}`));

async function countDemoData() {
  const [
    testimonials,
    returnItems,
    refunds,
    returns,
    couponRedemptions,
    webhookEvents,
    analyticsEvents,
    cartItems,
    carts,
    payments,
    orderItems,
    orders,
    inventory,
    variants,
    products,
    offerProducts,
    offers,
    coupons,
    collections,
    categories,
    addresses,
    authCredentials,
    users,
  ] = await Promise.all([
    prisma.testimonial.count({ where: { order: { orderNumber: demoOrderNumber } } }),
    prisma.returnItem.count({ where: { return: { order: { orderNumber: demoOrderNumber } } } }),
    prisma.refund.count({ where: { order: { orderNumber: demoOrderNumber } } }),
    prisma.return.count({ where: { order: { orderNumber: demoOrderNumber } } }),
    prisma.couponRedemption.count({ where: { order: { orderNumber: demoOrderNumber } } }),
    prisma.webhookEvent.count({ where: { eventId: startsWithDemo } }),
    prisma.analyticsEvent.count({ where: { sessionId: { startsWith: "demo-session-" } } }),
    prisma.cartItem.count({ where: { cart: { id: startsWithDemo } } }),
    prisma.cart.count({ where: { id: startsWithDemo } }),
    prisma.payment.count({ where: { order: { orderNumber: demoOrderNumber } } }),
    prisma.orderItem.count({ where: { order: { orderNumber: demoOrderNumber } } }),
    prisma.order.count({ where: { orderNumber: demoOrderNumber } }),
    prisma.inventory.count({ where: { variant: { sku: demoSku } } }),
    prisma.productVariant.count({ where: { sku: demoSku } }),
    prisma.product.count({ where: { slug: demoSlug } }),
    prisma.offerProduct.count({ where: { offerId: { in: DEMO_OFFER_IDS } } }),
    prisma.offer.count({ where: { id: { in: DEMO_OFFER_IDS } } }),
    prisma.coupon.count({ where: { code: { startsWith: "DEMO-" } } }),
    prisma.collection.count({ where: { slug: demoSlug } }),
    prisma.category.count({ where: { slug: demoSlug } }),
    prisma.address.count({ where: { id: startsWithDemo } }),
    prisma.authCredential.count({ where: { user: { email: demoEmail } } }),
    prisma.user.count({ where: { email: demoEmail } }),
  ]);
  return { testimonials, returnItems, refunds, returns, couponRedemptions, webhookEvents, analyticsEvents, cartItems, carts, payments, orderItems, orders, inventory, variants, products, offerProducts, offers, coupons, collections, categories, addresses, authCredentials, users };
}

async function main() {
  const confirmed = process.argv.includes("--confirm");
  const counts = await countDemoData();

  console.log("Demo data found:");
  console.log(`  ${counts.categories} categories`);
  console.log(`  ${counts.products} products`);
  console.log(`  ${counts.variants} variants`);
  console.log(`  ${counts.collections} collections`);
  console.log(`  ${counts.offers} offers`);
  console.log(`  ${counts.coupons} coupons`);
  console.log(`  ${counts.users} customers`);
  console.log(`  ${counts.orders} orders`);
  console.log(`  ${counts.orderItems} order items`);
  console.log(`  ${counts.payments} payments`);
  console.log(`  ${counts.returns} returns / ${counts.refunds} refunds`);
  console.log(`  ${counts.webhookEvents} webhook events`);
  console.log(`  ${counts.analyticsEvents} analytics events`);
  console.log(`  ${counts.carts} carts / ${counts.cartItems} cart items`);
  console.log(`  ${counts.testimonials} testimonials`);
  console.log("\nWarehouse / PricingSetting / ShippingRule / GstSlab rows are never touched — they are not demo-namespaced.");

  if (!confirmed) {
    console.log("\nDry run only — no rows were deleted. Re-run with --confirm to delete the data listed above.");
    await prisma.$disconnect();
    return;
  }

  console.log("\n--confirm passed — deleting demo data (children before parents)...");

  await prisma.$transaction(
    async (tx) => {
      await tx.testimonial.deleteMany({ where: { order: { orderNumber: demoOrderNumber } } });
      await tx.couponRedemption.deleteMany({ where: { order: { orderNumber: demoOrderNumber } } });
      await tx.returnItem.deleteMany({ where: { return: { order: { orderNumber: demoOrderNumber } } } });
      await tx.refund.deleteMany({ where: { order: { orderNumber: demoOrderNumber } } });
      await tx.return.deleteMany({ where: { order: { orderNumber: demoOrderNumber } } });
      await tx.webhookEvent.deleteMany({ where: { eventId: startsWithDemo } });
      await tx.analyticsEvent.deleteMany({ where: { sessionId: { startsWith: "demo-session-" } } });
      await tx.cartItem.deleteMany({ where: { cart: { id: startsWithDemo } } });
      await tx.cart.deleteMany({ where: { id: startsWithDemo } });
      // Order cascades OrderItem + Payment on delete.
      await tx.order.deleteMany({ where: { orderNumber: demoOrderNumber } });
      await tx.inventory.deleteMany({ where: { variant: { sku: demoSku } } });
      await tx.productVariant.deleteMany({ where: { sku: demoSku } });
      // Product cascades ProductImage + ProductCollection on delete.
      await tx.offerProduct.deleteMany({ where: { offerId: { in: DEMO_OFFER_IDS } } });
      await tx.product.deleteMany({ where: { slug: demoSlug } });
      await tx.offer.deleteMany({ where: { id: { in: DEMO_OFFER_IDS } } });
      // Coupon cascades CouponProduct/CouponCategory on delete.
      await tx.coupon.deleteMany({ where: { code: { startsWith: "DEMO-" } } });
      await tx.collection.deleteMany({ where: { slug: demoSlug } });
      await tx.category.deleteMany({ where: { slug: demoSlug } });
      await tx.address.deleteMany({ where: { id: startsWithDemo } });
      await tx.authCredential.deleteMany({ where: { user: { email: demoEmail } } });
      await tx.user.deleteMany({ where: { email: demoEmail } });
    },
    { timeout: 30000 },
  );

  const remaining = await countDemoData();
  const remainingTotal = Object.values(remaining).reduce((s, v) => s + v, 0);
  console.log(remainingTotal === 0 ? "\nDemo data fully removed." : `\nWarning: ${remainingTotal} demo rows still remain — inspect manually.`);
}

main()
  .catch((e) => {
    console.error("Demo reset failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
