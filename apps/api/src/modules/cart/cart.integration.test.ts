import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

/**
 * Integration tests against the REAL test database (see auth's/orders' own
 * integration test files for the setup this mirrors). Covers a Week 1
 * completion audit finding: a logged-in user's cart resolution (GET /cart,
 * POST /cart/merge, or checkout's own resolution) 500'd with a Prisma
 * unique-constraint violation on `Cart.userId` for any user who already had
 * a non-ACTIVE cart (e.g. CONVERTED, after a prior completed checkout) —
 * GetOrCreateCartUseCase tried to INSERT a second cart row for that user
 * instead of reactivating the existing one. Caught by live browser
 * verification (register → shop → checkout → back to shopping), not by
 * the pre-existing automated suite, which never exercised "resolve a cart
 * again after checkout" for a logged-in user.
 */

const TEST_PREFIX = "cart-audit";
const app = createApp();

let categoryId: string;
let warehouseId: string;
const createdProductIds: string[] = [];
const createdVariantIds: string[] = [];
const createdOrderIds: string[] = [];
const createdUserEmails: string[] = [];

beforeAll(async () => {
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  categoryId = category.id;
  const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { isActive: true } });
  warehouseId = warehouse.id;
});

afterAll(async () => {
  if (createdOrderIds.length > 0) {
    await prisma.payment.deleteMany({ where: { orderId: { in: createdOrderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  }
  if (createdVariantIds.length > 0) {
    await prisma.cartItem.deleteMany({ where: { variantId: { in: createdVariantIds } } });
    await prisma.productVariant.deleteMany({ where: { id: { in: createdVariantIds } } });
  }
  if (createdProductIds.length > 0) {
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
  }
  if (createdUserEmails.length > 0) {
    await prisma.user.deleteMany({ where: { email: { in: createdUserEmails } } }); // cascades Cart (onDelete: SetNull sets userId null, cart itself stays — fine, orphaned test row)
  }
  await prisma.$disconnect();
});

async function createTestVariant(): Promise<{ variantId: string }> {
  const suffix = crypto.randomUUID().slice(0, 8);
  const product = await prisma.product.create({
    data: { name: `${TEST_PREFIX} Product ${suffix}`, slug: `${TEST_PREFIX}-${suffix}`, categoryId, isActive: true },
  });
  createdProductIds.push(product.id);
  const variant = await prisma.productVariant.create({
    data: { productId: product.id, sku: `${TEST_PREFIX}-${suffix}`, color: "Black", size: "M", weightGrams: 1200, isActive: true },
  });
  createdVariantIds.push(variant.id);
  await prisma.inventory.create({ data: { variantId: variant.id, warehouseId, quantityAvailable: 5, quantityReserved: 0 } });
  return { variantId: variant.id };
}

describe("cart: resolution after a completed checkout (regression)", () => {
  it("does not 500 when a logged-in user's cart is resolved again after their cart already CONVERTED", async () => {
    const email = `${TEST_PREFIX}-${crypto.randomUUID()}@test.woobe.internal`;
    createdUserEmails.push(email);
    const agent = request.agent(app);

    const registerRes = await agent.post("/api/v1/auth/register").send({ name: "Cart Audit", email, password: "Passw0rd1" });
    const accessToken = registerRes.body.accessToken as string;

    const { variantId } = await createTestVariant();
    await agent.post("/api/v1/cart/items").send({ variantId, quantity: 1 });

    const checkoutRes = await agent.post("/api/v1/orders/checkout").send({
      contactEmail: email,
      address: { fullName: "Cart Audit", phone: "9876543210", line1: "1 Test St", city: "Bengaluru", state: "Karnataka", pincode: "560001" },
      paymentMethod: "COD",
    });
    expect(checkoutRes.status).toBe(201);
    createdOrderIds.push(checkoutRes.body.id);

    // Cart is now CONVERTED — this is exactly what 500'd before the fix.
    const getCartRes = await agent.get("/api/v1/cart").set("Authorization", `Bearer ${accessToken}`);
    expect(getCartRes.status).toBe(200);
    expect(getCartRes.body.items).toHaveLength(0); // fresh, cleared — not the ordered item reappearing

    // POST /cart/merge is the other path that crashed the same way.
    const mergeRes = await agent.post("/api/v1/cart/merge").set("Authorization", `Bearer ${accessToken}`);
    expect(mergeRes.status).toBe(200);

    // The reactivated cart is genuinely usable, not just non-erroring.
    const addAgainRes = await agent
      .post("/api/v1/cart/items")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ variantId, quantity: 1 });
    expect(addAgainRes.status).toBe(200);
    expect(addAgainRes.body.items).toHaveLength(1);
  });
});
