import { randomUUID } from "node:crypto";
import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

/**
 * Integration tests against the REAL test database — helpers mirror
 * returns.integration.test.ts's own (createTestCustomer/loginAdmin/
 * checkoutCodOrder/deliverOrder), not reinvented. Covers the 2026-09-11
 * testimonial design end to end: eligibility, the DB-level one-per-order
 * guarantee (including a real concurrent race), moderation, RBAC, public
 * visibility, aggregate correctness, and the "customer must never learn
 * the moderation state" anti-abuse requirement.
 */

const TEST_PREFIX = "testimonials-integration";
const app = createApp();

let categoryId: string;
let warehouseId: string;
const createdUserIds: string[] = [];
const createdProductIds: string[] = [];
const createdVariantIds: string[] = [];
const createdOrderIds: string[] = [];

beforeAll(async () => {
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  categoryId = category.id;
  const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { isActive: true } });
  warehouseId = warehouse.id;
});

afterAll(async () => {
  if (createdOrderIds.length > 0) {
    const testimonials = await prisma.testimonial.findMany({ where: { orderId: { in: createdOrderIds } }, select: { id: true } });
    const testimonialIds = testimonials.map((t) => t.id);
    if (testimonialIds.length > 0) {
      await prisma.adminAuditLog.deleteMany({ where: { entityType: "Testimonial", entityId: { in: testimonialIds } } });
      await prisma.testimonialImage.deleteMany({ where: { testimonialId: { in: testimonialIds } } });
      await prisma.testimonial.deleteMany({ where: { id: { in: testimonialIds } } });
    }
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  }
  if (createdVariantIds.length > 0) {
    await prisma.cartItem.deleteMany({ where: { variantId: { in: createdVariantIds } } });
    await prisma.productVariant.deleteMany({ where: { id: { in: createdVariantIds } } });
  }
  if (createdProductIds.length > 0) {
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
  }
  if (createdUserIds.length > 0) {
    await prisma.cart.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

async function createTestVariant(): Promise<{ variantId: string }> {
  const suffix = randomUUID().slice(0, 8);
  const product = await prisma.product.create({
    data: { name: `${TEST_PREFIX} Product ${suffix}`, slug: `${TEST_PREFIX}-${suffix}`, categoryId, isActive: true },
  });
  createdProductIds.push(product.id);

  const variant = await prisma.productVariant.create({
    // 1200g — clears ADR-021's minimum order weight for checkout (same fixture value returns.integration.test.ts's own createTestVariant uses).
    data: { productId: product.id, sku: `${TEST_PREFIX}-${suffix}`, color: "Black", size: "M", weightGrams: 1200, isActive: true },
  });
  createdVariantIds.push(variant.id);

  await prisma.inventory.create({ data: { variantId: variant.id, warehouseId, quantityAvailable: 20, quantityReserved: 0 } });
  return { variantId: variant.id };
}

const checkoutAddress = {
  fullName: "Test Buyer",
  phone: "9876543210",
  line1: "123 Test Street",
  city: "Bengaluru",
  state: "Karnataka",
  pincode: "560001",
};

async function createTestCustomer(): Promise<{ agent: ReturnType<typeof request.agent>; userId: string }> {
  const email = `${TEST_PREFIX}-${randomUUID()}@test.woobe.internal`;
  const registerRes = await request(app).post("/api/v1/auth/register").send({ name: "Testimonial Tester", email, password: "Passw0rd1" });
  expect(registerRes.status).toBe(201);
  createdUserIds.push(registerRes.body.user.id);
  const agent = request.agent(app).set("Authorization", `Bearer ${registerRes.body.accessToken as string}`);
  return { agent, userId: registerRes.body.user.id };
}

async function loginAdmin(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/v1/admin/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

async function checkoutCodOrder(agent: ReturnType<typeof request.agent>, variantId: string): Promise<{ id: string }> {
  await agent.post("/api/v1/cart/items").send({ variantId, quantity: 1 });
  const checkoutRes = await agent
    .post("/api/v1/orders/checkout")
    .send({ contactEmail: "buyer@test.woobe.internal", address: checkoutAddress, paymentMethod: "COD" });
  expect(checkoutRes.status).toBe(201);
  createdOrderIds.push(checkoutRes.body.id);
  const confirmRes = await agent.post("/api/v1/payments/cod/confirm").send({ orderId: checkoutRes.body.id });
  expect(confirmRes.status).toBe(200);
  return { id: checkoutRes.body.id };
}

/** Drives an order from CONFIRMED all the way to DELIVERED via the real admin API — same helper shape as returns.integration.test.ts's own. */
async function deliverOrder(orderId: string, adminAuth: string): Promise<void> {
  const auth = { Authorization: `Bearer ${adminAuth}` };
  expect((await request(app).post(`/api/v1/admin/orders/${orderId}/processing`).set(auth)).status).toBe(200);
  expect((await request(app).post(`/api/v1/admin/orders/${orderId}/packed`).set(auth)).status).toBe(200);
  expect((await request(app).post(`/api/v1/admin/orders/${orderId}/ship`).set(auth).send({ trackingNumber: "TRK1", carrier: "BlueDart" })).status).toBe(200);
  expect((await request(app).post(`/api/v1/admin/orders/${orderId}/deliver`).set(auth)).status).toBe(200);
}

const superAdminAuth = () => loginAdmin("admin@woobe.in", "Admin@12345");
const orderStaffAuth = () => loginAdmin("orders@woobe.in", "Staff@12345");

describe("POST /api/v1/testimonials — eligibility", () => {
  it("rejects submission for an order that hasn't been delivered yet", async () => {
    const { agent } = await createTestCustomer();
    const { variantId } = await createTestVariant();
    const order = await checkoutCodOrder(agent, variantId); // stays CONFIRMED, never delivered

    const res = await agent.post("/api/v1/testimonials").field("orderId", order.id).field("rating", "5").field("text", "Loved the whole experience!");

    expect(res.status).toBe(422);
  });

  it("rejects submission for another customer's order (surfaces as 404, same posture as GetOrderUseCase)", async () => {
    const owner = await createTestCustomer();
    const { variantId } = await createTestVariant();
    const order = await checkoutCodOrder(owner.agent, variantId);
    const adminAuth = await superAdminAuth();
    await deliverOrder(order.id, adminAuth);

    const intruder = await createTestCustomer();
    const res = await intruder.agent
      .post("/api/v1/testimonials")
      .field("orderId", order.id)
      .field("rating", "5")
      .field("text", "Trying to claim someone else's order.");

    expect(res.status).toBe(404);
  });

  it("rejects an unauthenticated submission", async () => {
    const res = await request(app).post("/api/v1/testimonials").field("orderId", randomUUID()).field("rating", "5").field("text", "No session at all.");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/testimonials — submission + anti-abuse response shape", () => {
  it("succeeds on a delivered order and the response never mentions PENDING or any moderation status", async () => {
    const { agent } = await createTestCustomer();
    const { variantId } = await createTestVariant();
    const order = await checkoutCodOrder(agent, variantId);
    await deliverOrder(order.id, await superAdminAuth());

    const res = await agent
      .post("/api/v1/testimonials")
      .field("orderId", order.id)
      .field("rating", "5")
      .field("text", "The fabric was beautiful and it arrived so quickly.");

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ message: "Thank you for sharing your experience." });
    expect(JSON.stringify(res.body).toLowerCase()).not.toMatch(/pending|approved|rejected|status/);

    const dbRow = await prisma.testimonial.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(dbRow.status).toBe("PENDING");
    expect(dbRow.rating).toBe(5);
  });

  it("GET /by-order/:orderId reports only `exists`, never the underlying status, before and after moderation", async () => {
    const { agent } = await createTestCustomer();
    const { variantId } = await createTestVariant();
    const order = await checkoutCodOrder(agent, variantId);
    await deliverOrder(order.id, await superAdminAuth());

    const before = await agent.get(`/api/v1/testimonials/by-order/${order.id}`);
    expect(before.status).toBe(200);
    expect(before.body).toEqual({ exists: false });

    await agent.post("/api/v1/testimonials").field("orderId", order.id).field("rating", "3").field("text", "Decent quality, a bit slow to arrive.");

    const after = await agent.get(`/api/v1/testimonials/by-order/${order.id}`);
    expect(after.body).toEqual({ exists: true });

    // Reject it and confirm the customer-facing shape is unchanged — no status leak either way.
    const adminAuth = await superAdminAuth();
    const testimonial = await prisma.testimonial.findUniqueOrThrow({ where: { orderId: order.id } });
    await request(app).post(`/api/v1/admin/testimonials/${testimonial.id}/reject`).set("Authorization", `Bearer ${adminAuth}`);

    const afterRejection = await agent.get(`/api/v1/testimonials/by-order/${order.id}`);
    expect(afterRejection.body).toEqual({ exists: true });
  });

  it.each([
    ["0", "rating below range"],
    ["6", "rating above range"],
    ["4.5", "non-integer rating"],
  ])("rejects an invalid rating (%s — %s)", async (rating) => {
    const { agent } = await createTestCustomer();
    const { variantId } = await createTestVariant();
    const order = await checkoutCodOrder(agent, variantId);
    await deliverOrder(order.id, await superAdminAuth());

    const res = await agent.post("/api/v1/testimonials").field("orderId", order.id).field("rating", rating).field("text", "Some perfectly fine text here.");
    expect(res.status).toBe(400);
  });

  it("rejects text that's too short", async () => {
    const { agent } = await createTestCustomer();
    const { variantId } = await createTestVariant();
    const order = await checkoutCodOrder(agent, variantId);
    await deliverOrder(order.id, await superAdminAuth());

    const res = await agent.post("/api/v1/testimonials").field("orderId", order.id).field("rating", "5").field("text", "Too short");
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/testimonials — one testimonial per order, DB-enforced", () => {
  it("rejects a second submission for an order that already has one", async () => {
    const { agent } = await createTestCustomer();
    const { variantId } = await createTestVariant();
    const order = await checkoutCodOrder(agent, variantId);
    await deliverOrder(order.id, await superAdminAuth());

    const first = await agent.post("/api/v1/testimonials").field("orderId", order.id).field("rating", "5").field("text", "My genuine first experience.");
    expect(first.status).toBe(201);

    const second = await agent.post("/api/v1/testimonials").field("orderId", order.id).field("rating", "1").field("text", "Trying to submit a second one.");
    expect(second.status).toBe(409);

    const count = await prisma.testimonial.count({ where: { orderId: order.id } });
    expect(count).toBe(1);
  });

  it("stays at exactly one row under concurrent duplicate submissions — the DB unique constraint, not a check-then-insert, is what makes this safe", async () => {
    const { agent } = await createTestCustomer();
    const { variantId } = await createTestVariant();
    const order = await checkoutCodOrder(agent, variantId);
    await deliverOrder(order.id, await superAdminAuth());

    const submit = () => agent.post("/api/v1/testimonials").field("orderId", order.id).field("rating", "5").field("text", "Racing to submit this order.");
    const [a, b] = await Promise.all([submit(), submit()]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);

    const count = await prisma.testimonial.count({ where: { orderId: order.id } });
    expect(count).toBe(1);
  });
});

describe("Admin testimonial moderation", () => {
  async function submitAndFetchId(): Promise<{ testimonialId: string; orderId: string; agent: ReturnType<typeof request.agent> }> {
    const { agent } = await createTestCustomer();
    const { variantId } = await createTestVariant();
    const order = await checkoutCodOrder(agent, variantId);
    await deliverOrder(order.id, await superAdminAuth());
    const submitRes = await agent
      .post("/api/v1/testimonials")
      .field("orderId", order.id)
      .field("rating", "5")
      .field("text", "A genuinely lovely shopping experience overall.");
    expect(submitRes.status).toBe(201);
    const testimonial = await prisma.testimonial.findUniqueOrThrow({ where: { orderId: order.id } });
    return { testimonialId: testimonial.id, orderId: order.id, agent };
  }

  it("rejects moderation from an unauthenticated caller and from a non-super-admin staff role", async () => {
    const { testimonialId } = await submitAndFetchId();

    const unauth = await request(app).post(`/api/v1/admin/testimonials/${testimonialId}/approve`);
    expect(unauth.status).toBe(401);

    const staffAuth = await orderStaffAuth(); // ORDER_PROCESSING_STAFF — MANAGE_ORDERS only, not MANAGE_TESTIMONIALS
    const forbidden = await request(app).post(`/api/v1/admin/testimonials/${testimonialId}/approve`).set("Authorization", `Bearer ${staffAuth}`);
    expect(forbidden.status).toBe(403);
  });

  it("approve: PENDING -> APPROVED, records an audit event, and becomes publicly visible via the homepage rail", async () => {
    const { testimonialId } = await submitAndFetchId();
    const adminAuth = await superAdminAuth();

    const listBefore = await request(app).get("/api/v1/admin/testimonials?status=PENDING").set("Authorization", `Bearer ${adminAuth}`);
    expect(listBefore.status).toBe(200);
    expect(listBefore.body.items.map((t: { id: string }) => t.id)).toContain(testimonialId);

    const approveRes = await request(app).post(`/api/v1/admin/testimonials/${testimonialId}/approve`).set("Authorization", `Bearer ${adminAuth}`);
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.testimonial.status).toBe("APPROVED");

    const audit = await prisma.adminAuditLog.findFirst({ where: { entityType: "Testimonial", entityId: testimonialId, action: "TESTIMONIAL_APPROVED" } });
    expect(audit).not.toBeNull();

    const homeRes = await request(app).get("/api/v1/home");
    const publicIds: string[] = homeRes.body.testimonials.map((t: { id: string }) => t.id);
    expect(publicIds).toContain(testimonialId);
  });

  it("approve is idempotent-safe: a second approve/reject on an already-moderated testimonial is rejected, not silently repeated", async () => {
    const { testimonialId } = await submitAndFetchId();
    const adminAuth = await superAdminAuth();

    expect((await request(app).post(`/api/v1/admin/testimonials/${testimonialId}/approve`).set("Authorization", `Bearer ${adminAuth}`)).status).toBe(200);
    const second = await request(app).post(`/api/v1/admin/testimonials/${testimonialId}/approve`).set("Authorization", `Bearer ${adminAuth}`);
    expect(second.status).toBe(409);
  });

  it("reject: PENDING -> REJECTED, never publicly visible, and the customer cannot submit a second testimonial for that order", async () => {
    const { testimonialId, orderId, agent } = await submitAndFetchId();
    const adminAuth = await superAdminAuth();

    const rejectRes = await request(app).post(`/api/v1/admin/testimonials/${testimonialId}/reject`).set("Authorization", `Bearer ${adminAuth}`);
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.testimonial.status).toBe("REJECTED");

    const audit = await prisma.adminAuditLog.findFirst({ where: { entityType: "Testimonial", entityId: testimonialId, action: "TESTIMONIAL_REJECTED" } });
    expect(audit).not.toBeNull();

    const homeRes = await request(app).get("/api/v1/home");
    const publicIds: string[] = homeRes.body.testimonials.map((t: { id: string }) => t.id);
    expect(publicIds).not.toContain(testimonialId);

    // No REJECTED -> RESUBMITTED path exists — the order already has a row, so this must fail exactly like any other duplicate.
    const resubmit = await agent.post("/api/v1/testimonials").field("orderId", orderId).field("rating", "5").field("text", "Trying to resubmit after rejection.");
    expect(resubmit.status).toBe(409);
  });
});

describe("Aggregate rating", () => {
  it("counts only APPROVED testimonials — PENDING and REJECTED never contribute", async () => {
    const before = await request(app).get("/api/v1/home");
    const baselineCount = before.body.testimonialAggregate?.approvedCount ?? 0;

    const { agent } = await createTestCustomer();
    const { variantId } = await createTestVariant();
    const order = await checkoutCodOrder(agent, variantId);
    await deliverOrder(order.id, await superAdminAuth());
    await agent.post("/api/v1/testimonials").field("orderId", order.id).field("rating", "4").field("text", "Solid experience, would shop again soon.");

    // Still PENDING — aggregate must be unchanged.
    const stillPending = await request(app).get("/api/v1/home");
    expect(stillPending.body.testimonialAggregate?.approvedCount ?? 0).toBe(baselineCount);

    const testimonial = await prisma.testimonial.findUniqueOrThrow({ where: { orderId: order.id } });
    await request(app).post(`/api/v1/admin/testimonials/${testimonial.id}/approve`).set("Authorization", `Bearer ${await superAdminAuth()}`);

    const afterApproval = await request(app).get("/api/v1/home");
    expect(afterApproval.body.testimonialAggregate.approvedCount).toBe(baselineCount + 1);
  });
});
