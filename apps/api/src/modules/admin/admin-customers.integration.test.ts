import { randomUUID } from "node:crypto";
import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

/**
 * Integration tests against the REAL test database. Covers week2 (1).md
 * §19's own bar: customer list/detail/search/filter, orders + addresses +
 * basic activity in one view, account-status toggling (and that it
 * actually blocks login again, not just flips a display flag), and that
 * this whole surface is super_admin only (see permissions.ts's own
 * MANAGE_CUSTOMERS comment for why neither staff role gets it).
 */

const TEST_PREFIX = "admin-customers-integration";
const app = createApp();
const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await prisma.address.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.authCredential.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

async function registerCustomer(): Promise<{ userId: string; email: string; accessToken: string }> {
  const email = `${TEST_PREFIX}-${randomUUID()}@test.woobe.internal`;
  const res = await request(app).post("/api/v1/auth/register").send({ name: "Test Customer", email, password: "Passw0rd" });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.user.id);
  return { userId: res.body.user.id, email, accessToken: res.body.accessToken as string };
}

async function loginAdmin(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/v1/admin/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

describe("admin customers: RBAC", () => {
  it("403s an order_processing_staff (no MANAGE_CUSTOMERS)", async () => {
    const token = await loginAdmin("orders@woobe.in", "Staff@12345");
    const res = await request(app).get("/api/v1/admin/customers").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("403s a product_management_staff (no MANAGE_CUSTOMERS)", async () => {
    const token = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const res = await request(app).get("/api/v1/admin/customers").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("allows a super_admin to list customers", async () => {
    const token = await loginAdmin("admin@woobe.in", "Admin@12345");
    const res = await request(app).get("/api/v1/admin/customers").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe("admin customers: list + search", () => {
  it("finds a customer by name/email search", async () => {
    const { email } = await registerCustomer();
    const token = await loginAdmin("admin@woobe.in", "Admin@12345");

    const res = await request(app).get("/api/v1/admin/customers").set("Authorization", `Bearer ${token}`).query({ search: email });

    expect(res.status).toBe(200);
    expect(res.body.items.map((c: { email: string }) => c.email)).toContain(email);
    // Never exposes anything auth-credential/token-shaped.
    expect(res.body.items[0]).not.toHaveProperty("passwordHash");
  });

  it("never returns a staff/admin account in the customer list", async () => {
    const token = await loginAdmin("admin@woobe.in", "Admin@12345");
    const res = await request(app).get("/api/v1/admin/customers").set("Authorization", `Bearer ${token}`).query({ search: "orders@woobe.in" });
    expect(res.body.items).toHaveLength(0);
  });
});

describe("admin customers: detail", () => {
  it("returns the customer, their orders, addresses, and basic activity", async () => {
    const { userId, accessToken } = await registerCustomer();
    await request(app)
      .post("/api/v1/users/me/addresses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ fullName: "Test Customer", phone: "9876543210", line1: "123 Test St", city: "Bengaluru", state: "Karnataka", pincode: "560001" });

    const token = await loginAdmin("admin@woobe.in", "Admin@12345");
    const res = await request(app).get(`/api/v1/admin/customers/${userId}`).set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.customer.id).toBe(userId);
    // Regression guard: caught live (not by an earlier version of this test) as an "Invalid Date" render
    // on the admin customer-detail page — GetCustomerForAdminUseCase used to return UserEntity, which has
    // no createdAt at all, unlike the list row's own CustomerSummary shape.
    expect(new Date(res.body.customer.createdAt).toString()).not.toBe("Invalid Date");
    expect(res.body.addresses).toHaveLength(1);
    expect(res.body.orders).toEqual([]);
    expect(res.body.activity).toEqual({ orderCount: 0, totalSpentPaise: 0, lastOrderAt: null });
  });

  it("404s for a staff account id — this surface is customers only", async () => {
    const staff = await prisma.user.findUniqueOrThrow({ where: { email: "orders@woobe.in" } });
    const token = await loginAdmin("admin@woobe.in", "Admin@12345");

    const res = await request(app).get(`/api/v1/admin/customers/${staff.id}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it("404s for an unknown id", async () => {
    const token = await loginAdmin("admin@woobe.in", "Admin@12345");
    const res = await request(app).get(`/api/v1/admin/customers/${randomUUID()}`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe("admin customers: account status", () => {
  it("deactivates a customer — they can no longer log in", async () => {
    const { userId, email } = await registerCustomer();
    const token = await loginAdmin("admin@woobe.in", "Admin@12345");

    const deactivateRes = await request(app).post(`/api/v1/admin/customers/${userId}/active`).set("Authorization", `Bearer ${token}`).send({ isActive: false });
    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.customer.isActive).toBe(false);
    expect(new Date(deactivateRes.body.customer.createdAt).toString()).not.toBe("Invalid Date");

    const loginRes = await request(app).post("/api/v1/auth/login").send({ email, password: "Passw0rd" });
    expect(loginRes.status).toBe(403); // LoginUserUseCase's own ForbiddenError for a deactivated account

    // Reactivating restores login.
    await request(app).post(`/api/v1/admin/customers/${userId}/active`).set("Authorization", `Bearer ${token}`).send({ isActive: true });
    const secondLoginRes = await request(app).post("/api/v1/auth/login").send({ email, password: "Passw0rd" });
    expect(secondLoginRes.status).toBe(200);
  });
});
