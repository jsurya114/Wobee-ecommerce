import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

/**
 * Integration tests against the REAL test database (mirrors cart's/products'
 * own *.integration.test.ts files) — Week 2 Day 2 wishlist (week2 (1).md
 * §5's own test list: add/remove, duplicate prevention, authorization,
 * inactive-product behavior, cart conversion).
 */

const TEST_PREFIX = "wishlist-test";
const app = createApp();

let categoryId: string;
let warehouseId: string;
const createdProductIds: string[] = [];
const createdVariantIds: string[] = [];
const createdUserEmails: string[] = [];

beforeAll(async () => {
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  categoryId = category.id;
  const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { isActive: true } });
  warehouseId = warehouse.id;
});

afterAll(async () => {
  if (createdVariantIds.length > 0) {
    // move-to-cart tests leave a real CartItem behind — delete it before the
    // variant/product it references (same ordering cart.integration.test.ts
    // uses for its own fixtures).
    await prisma.cartItem.deleteMany({ where: { variantId: { in: createdVariantIds } } });
    await prisma.inventory.deleteMany({ where: { variantId: { in: createdVariantIds } } });
  }
  if (createdProductIds.length > 0) {
    // WishlistItem/ProductVariant cascade off Product's onDelete: Cascade.
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
  }
  if (createdUserEmails.length > 0) {
    // Wishlist cascades off User's onDelete: Cascade.
    await prisma.user.deleteMany({ where: { email: { in: createdUserEmails } } });
  }
  await prisma.$disconnect();
});

async function registerCustomer(): Promise<{ accessToken: string; email: string }> {
  const email = `${TEST_PREFIX}-${crypto.randomUUID()}@test.woobe.internal`;
  createdUserEmails.push(email);
  const res = await request(app).post("/api/v1/auth/register").send({ name: "Wishlist Tester", email, password: "Passw0rd1" });
  expect(res.status).toBe(201);
  return { accessToken: res.body.accessToken as string, email };
}

async function createTestProduct(opts: { isActive?: boolean; stock?: number } = {}): Promise<{ productId: string; variantId: string }> {
  const suffix = crypto.randomUUID().slice(0, 8);
  const product = await prisma.product.create({
    data: {
      name: `${TEST_PREFIX} Product ${suffix}`,
      slug: `${TEST_PREFIX}-${suffix}`,
      categoryId,
      isActive: opts.isActive ?? true,
      minPricePaiseCache: 10_000,
    },
  });
  createdProductIds.push(product.id);
  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      sku: `${TEST_PREFIX}-${suffix}`,
      color: "Black",
      size: "M",
      weightGrams: 500,
      isActive: true,
      effectivePricePaiseCache: 10_000,
    },
  });
  createdVariantIds.push(variant.id);
  await prisma.inventory.create({
    data: { variantId: variant.id, warehouseId, quantityAvailable: opts.stock ?? 5, quantityReserved: 0 },
  });
  return { productId: product.id, variantId: variant.id };
}

async function createVariant(productId: string, opts: { color?: string; size: string; stock?: number }): Promise<{ variantId: string }> {
  const suffix = crypto.randomUUID().slice(0, 8);
  const variant = await prisma.productVariant.create({
    data: {
      productId,
      sku: `${TEST_PREFIX}-${suffix}`,
      color: opts.color ?? "Black",
      size: opts.size,
      weightGrams: 500,
      isActive: true,
      effectivePricePaiseCache: 10_000,
    },
  });
  createdVariantIds.push(variant.id);
  await prisma.inventory.create({
    data: { variantId: variant.id, warehouseId, quantityAvailable: opts.stock ?? 5, quantityReserved: 0 },
  });
  return { variantId: variant.id };
}

describe("wishlist: authentication required", () => {
  it("rejects every route without a token", async () => {
    const getRes = await request(app).get("/api/v1/wishlist");
    expect(getRes.status).toBe(401);
    const postRes = await request(app).post("/api/v1/wishlist/items").send({ productId: crypto.randomUUID() });
    expect(postRes.status).toBe(401);
  });
});

describe("wishlist: add/remove", () => {
  it("adds a product-only item (no variant) and a variant item, and lists them newest-first", async () => {
    const { accessToken } = await registerCustomer();
    const { productId } = await createTestProduct();
    const { productId: productId2, variantId } = await createTestProduct();

    const add1 = await request(app).post("/api/v1/wishlist/items").set("Authorization", `Bearer ${accessToken}`).send({ productId });
    expect(add1.status).toBe(201);
    expect(add1.body.item).toMatchObject({ productId, variantId: null });

    const add2 = await request(app)
      .post("/api/v1/wishlist/items")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ productId: productId2, variantId });
    expect(add2.status).toBe(201);
    expect(add2.body.item).toMatchObject({ productId: productId2, variantId });

    const listRes = await request(app).get("/api/v1/wishlist").set("Authorization", `Bearer ${accessToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.itemCount).toBe(2);
    // newest-first: productId2 was added second.
    expect(listRes.body.items.map((i: { productId: string }) => i.productId)).toEqual([productId2, productId]);
    // PDP flow (variant chosen): line carries the variant + its color/size — the
    // wishlist page renders "Move to bag" off `variantId` being non-null.
    expect(listRes.body.items[0]).toMatchObject({ productId: productId2, variantId, color: "Black", size: "M", isAvailable: true });
    // Homepage/Shop flow (no variant chosen): line has no variant/color/size —
    // the wishlist page renders "Choose a size" off `variantId` being null.
    expect(listRes.body.items[1]).toMatchObject({ productId, variantId: null, color: null, size: null });
  });

  it("removes an item", async () => {
    const { accessToken } = await registerCustomer();
    const { productId } = await createTestProduct();
    const addRes = await request(app).post("/api/v1/wishlist/items").set("Authorization", `Bearer ${accessToken}`).send({ productId });
    const itemId = addRes.body.item.id as string;

    const removeRes = await request(app).delete(`/api/v1/wishlist/items/${itemId}`).set("Authorization", `Bearer ${accessToken}`);
    expect(removeRes.status).toBe(204);

    const listRes = await request(app).get("/api/v1/wishlist").set("Authorization", `Bearer ${accessToken}`);
    expect(listRes.body.itemCount).toBe(0);
  });

  it("404s removing an item that doesn't exist", async () => {
    const { accessToken } = await registerCustomer();
    const res = await request(app).delete(`/api/v1/wishlist/items/${crypto.randomUUID()}`).set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });

  it("rejects a variantId that doesn't belong to the given product", async () => {
    const { accessToken } = await registerCustomer();
    const { productId } = await createTestProduct();
    const { variantId: otherVariantId } = await createTestProduct();

    const res = await request(app)
      .post("/api/v1/wishlist/items")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ productId, variantId: otherVariantId });
    expect(res.status).toBe(400);
  });

  it("404s adding an unknown product", async () => {
    const { accessToken } = await registerCustomer();
    const res = await request(app)
      .post("/api/v1/wishlist/items")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ productId: crypto.randomUUID() });
    expect(res.status).toBe(404);
  });
});

describe("wishlist: saved-variant state drives the wishlist-page CTA (PDP vs homepage/shop)", () => {
  it("keeps a per-item saved variant distinct across items — one variant line, one no-variant line, on the same wishlist", async () => {
    const { accessToken } = await registerCustomer();
    const auth = { Authorization: `Bearer ${accessToken}` };
    const fromShop = await createTestProduct(); // no size selected on a listing card
    const fromPdp = await createTestProduct(); // a size was selected on the PDP

    await request(app).post("/api/v1/wishlist/items").set(auth).send({ productId: fromShop.productId });
    await request(app).post("/api/v1/wishlist/items").set(auth).send({ productId: fromPdp.productId, variantId: fromPdp.variantId });

    const listRes = await request(app).get("/api/v1/wishlist").set(auth);
    const byProduct = new Map<string, { variantId: string | null; size: string | null }>(
      listRes.body.items.map((i: { productId: string; variantId: string | null; size: string | null }) => [
        i.productId,
        { variantId: i.variantId, size: i.size },
      ]),
    );
    expect(byProduct.get(fromShop.productId)).toEqual({ variantId: null, size: null });
    expect(byProduct.get(fromPdp.productId)).toEqual({ variantId: fromPdp.variantId, size: "M" });
  });

  it("PDP flow end to end: save the selected variant, then add-to-cart uses that exact variant without re-choosing a size", async () => {
    const { accessToken } = await registerCustomer();
    const auth = { Authorization: `Bearer ${accessToken}` };
    const { productId } = await createTestProduct({ stock: 5 });
    const small = await createVariant(productId, { size: "S", stock: 5 });

    // PDP had size "S" selected when the heart was clicked.
    const addRes = await request(app).post("/api/v1/wishlist/items").set(auth).send({ productId, variantId: small.variantId });
    expect(addRes.status).toBe(201);
    const itemId = addRes.body.item.id as string;

    const moveRes = await request(app).post(`/api/v1/wishlist/items/${itemId}/move-to-cart`).set(auth).send({ quantity: 1 });
    expect(moveRes.status).toBe(200);

    const cartRes = await request(app).get("/api/v1/cart").set(auth);
    expect(cartRes.body.items).toHaveLength(1);
    expect(cartRes.body.items[0]).toMatchObject({ variantId: small.variantId, quantity: 1 });

    const listRes = await request(app).get("/api/v1/wishlist").set(auth);
    expect(listRes.body.itemCount).toBe(0);
  });

  it("removes a variant item the same way as a no-variant item", async () => {
    const { accessToken } = await registerCustomer();
    const auth = { Authorization: `Bearer ${accessToken}` };
    const { productId, variantId } = await createTestProduct();

    const addRes = await request(app).post("/api/v1/wishlist/items").set(auth).send({ productId, variantId });
    const itemId = addRes.body.item.id as string;

    const removeRes = await request(app).delete(`/api/v1/wishlist/items/${itemId}`).set(auth);
    expect(removeRes.status).toBe(204);

    const listRes = await request(app).get("/api/v1/wishlist").set(auth);
    expect(listRes.body.itemCount).toBe(0);
  });

  it("does not change duplicate behavior — a product is still one wishlist row regardless of which variant a later add sends", async () => {
    const { accessToken } = await registerCustomer();
    const auth = { Authorization: `Bearer ${accessToken}` };
    const { productId, variantId } = await createTestProduct();
    const large = await createVariant(productId, { size: "L" });

    const first = await request(app).post("/api/v1/wishlist/items").set(auth).send({ productId, variantId });
    expect(first.status).toBe(201);

    const second = await request(app).post("/api/v1/wishlist/items").set(auth).send({ productId, variantId: large.variantId });
    expect(second.status).toBe(409);

    const listRes = await request(app).get("/api/v1/wishlist").set(auth);
    expect(listRes.body.itemCount).toBe(1);
    // the original saved variant is untouched by the rejected second add.
    expect(listRes.body.items[0]).toMatchObject({ productId, variantId, size: "M" });
  });
});

describe("wishlist: duplicate prevention", () => {
  it("surfaces a re-add of the same product as a clean 409, not a raw 500", async () => {
    const { accessToken } = await registerCustomer();
    const { productId } = await createTestProduct();
    const auth = { Authorization: `Bearer ${accessToken}` };

    const first = await request(app).post("/api/v1/wishlist/items").set(auth).send({ productId });
    expect(first.status).toBe(201);

    const second = await request(app).post("/api/v1/wishlist/items").set(auth).send({ productId });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("CONFLICT");

    // Still exactly one item — the duplicate attempt didn't create a second row.
    const listRes = await request(app).get("/api/v1/wishlist").set(auth);
    expect(listRes.body.itemCount).toBe(1);
  });
});

describe("wishlist: check state", () => {
  it("reports inWishlist true/false correctly, with the item id when true", async () => {
    const { accessToken } = await registerCustomer();
    const { productId } = await createTestProduct();
    const auth = { Authorization: `Bearer ${accessToken}` };

    const beforeRes = await request(app).get(`/api/v1/wishlist/state/${productId}`).set(auth);
    expect(beforeRes.body).toEqual({ inWishlist: false, itemId: null });

    const addRes = await request(app).post("/api/v1/wishlist/items").set(auth).send({ productId });

    const afterRes = await request(app).get(`/api/v1/wishlist/state/${productId}`).set(auth);
    expect(afterRes.body).toEqual({ inWishlist: true, itemId: addRes.body.item.id });
  });
});

describe("wishlist: authorization — a customer can't see or modify another customer's wishlist", () => {
  it("customer B's wishlist stays empty despite customer A's items", async () => {
    const a = await registerCustomer();
    const b = await registerCustomer();
    const { productId } = await createTestProduct();

    await request(app).post("/api/v1/wishlist/items").set("Authorization", `Bearer ${a.accessToken}`).send({ productId });

    const bListRes = await request(app).get("/api/v1/wishlist").set("Authorization", `Bearer ${b.accessToken}`);
    expect(bListRes.body.itemCount).toBe(0);
  });

  it("customer B cannot remove customer A's wishlist item by id (404, not success)", async () => {
    const a = await registerCustomer();
    const b = await registerCustomer();
    const { productId } = await createTestProduct();

    const addRes = await request(app).post("/api/v1/wishlist/items").set("Authorization", `Bearer ${a.accessToken}`).send({ productId });
    const itemId = addRes.body.item.id as string;

    const bRemoveRes = await request(app).delete(`/api/v1/wishlist/items/${itemId}`).set("Authorization", `Bearer ${b.accessToken}`);
    expect(bRemoveRes.status).toBe(404);

    // A's item survives B's attempt.
    const aListRes = await request(app).get("/api/v1/wishlist").set("Authorization", `Bearer ${a.accessToken}`);
    expect(aListRes.body.itemCount).toBe(1);
  });

  it("customer B cannot move customer A's wishlist item to B's cart", async () => {
    const a = await registerCustomer();
    const b = await registerCustomer();
    const { productId, variantId } = await createTestProduct();

    const addRes = await request(app)
      .post("/api/v1/wishlist/items")
      .set("Authorization", `Bearer ${a.accessToken}`)
      .send({ productId, variantId });
    const itemId = addRes.body.item.id as string;

    const bMoveRes = await request(app)
      .post(`/api/v1/wishlist/items/${itemId}/move-to-cart`)
      .set("Authorization", `Bearer ${b.accessToken}`)
      .send({ quantity: 1 });
    expect(bMoveRes.status).toBe(404);
  });
});

describe("wishlist: inactive/out-of-stock product behavior", () => {
  it("an inactive product's wishlist item is shown, flagged unavailable, not dropped or crashing the view", async () => {
    const { accessToken } = await registerCustomer();
    const { productId } = await createTestProduct({ isActive: false });
    const auth = { Authorization: `Bearer ${accessToken}` };

    const addRes = await request(app).post("/api/v1/wishlist/items").set(auth).send({ productId });
    expect(addRes.status).toBe(201);

    const listRes = await request(app).get("/api/v1/wishlist").set(auth);
    expect(listRes.status).toBe(200);
    expect(listRes.body.itemCount).toBe(1);
    expect(listRes.body.items[0]).toMatchObject({ productId, isProductActive: false, isAvailable: false });
  });

  it("an out-of-stock variant item is shown, flagged unavailable via availableQuantity/isAvailable", async () => {
    const { accessToken } = await registerCustomer();
    const { productId, variantId } = await createTestProduct({ stock: 0 });
    const auth = { Authorization: `Bearer ${accessToken}` };

    await request(app).post("/api/v1/wishlist/items").set(auth).send({ productId, variantId });

    const listRes = await request(app).get("/api/v1/wishlist").set(auth);
    expect(listRes.body.items[0]).toMatchObject({ variantId, availableQuantity: 0, isAvailable: false });
  });
});

describe("wishlist: cart conversion (move-to-cart)", () => {
  it("adds the variant to the caller's cart and removes the wishlist item", async () => {
    const { accessToken } = await registerCustomer();
    const { productId, variantId } = await createTestProduct({ stock: 3 });
    const auth = { Authorization: `Bearer ${accessToken}` };

    const addRes = await request(app).post("/api/v1/wishlist/items").set(auth).send({ productId, variantId });
    const itemId = addRes.body.item.id as string;

    const moveRes = await request(app).post(`/api/v1/wishlist/items/${itemId}/move-to-cart`).set(auth).send({ quantity: 2 });
    expect(moveRes.status).toBe(200);
    expect(moveRes.body.cartId).toBeTruthy();

    const cartRes = await request(app).get("/api/v1/cart").set(auth);
    expect(cartRes.status).toBe(200);
    expect(cartRes.body.items).toHaveLength(1);
    expect(cartRes.body.items[0]).toMatchObject({ variantId, quantity: 2 });

    // Moved out of the wishlist.
    const listRes = await request(app).get("/api/v1/wishlist").set(auth);
    expect(listRes.body.itemCount).toBe(0);
  });

  it("422s moving a no-variant item — a size must be chosen first", async () => {
    const { accessToken } = await registerCustomer();
    const { productId } = await createTestProduct();
    const auth = { Authorization: `Bearer ${accessToken}` };

    const addRes = await request(app).post("/api/v1/wishlist/items").set(auth).send({ productId });
    const itemId = addRes.body.item.id as string;

    const moveRes = await request(app).post(`/api/v1/wishlist/items/${itemId}/move-to-cart`).set(auth).send({ quantity: 1 });
    expect(moveRes.status).toBe(422);

    // Item stays in the wishlist — the failed conversion isn't destructive.
    const listRes = await request(app).get("/api/v1/wishlist").set(auth);
    expect(listRes.body.itemCount).toBe(1);
  });

  it("422s moving an item whose live stock can't cover the requested quantity", async () => {
    const { accessToken } = await registerCustomer();
    const { productId, variantId } = await createTestProduct({ stock: 1 });
    const auth = { Authorization: `Bearer ${accessToken}` };

    const addRes = await request(app).post("/api/v1/wishlist/items").set(auth).send({ productId, variantId });
    const itemId = addRes.body.item.id as string;

    const moveRes = await request(app).post(`/api/v1/wishlist/items/${itemId}/move-to-cart`).set(auth).send({ quantity: 5 });
    expect(moveRes.status).toBe(422);

    const listRes = await request(app).get("/api/v1/wishlist").set(auth);
    expect(listRes.body.itemCount).toBe(1);
  });
});
