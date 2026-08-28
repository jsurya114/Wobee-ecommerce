import { randomUUID } from "node:crypto";
import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

/**
 * Integration tests against the REAL test database. Covers week2 (1).md
 * §15's own bar: manual adjustments must be authorized (RBAC), validated
 * (never negative, never below what's reserved), transaction-safe, and
 * auditable.
 */

const TEST_PREFIX = "admin-inventory-integration";
const app = createApp();

let categoryId: string;
let warehouseId: string;
const createdProductIds: string[] = [];
const createdVariantIds: string[] = [];

beforeAll(async () => {
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  categoryId = category.id;
  const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { isActive: true } });
  warehouseId = warehouse.id;
});

afterAll(async () => {
  if (createdVariantIds.length > 0) {
    await prisma.adminAuditLog.deleteMany({ where: { entityId: { in: createdVariantIds } } });
    await prisma.inventory.deleteMany({ where: { variantId: { in: createdVariantIds } } });
    await prisma.productVariant.deleteMany({ where: { id: { in: createdVariantIds } } });
  }
  if (createdProductIds.length > 0) {
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
  }
  await prisma.$disconnect();
});

async function loginAdmin(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/v1/admin/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

async function createTestVariant(quantityAvailable: number, quantityReserved = 0): Promise<{ variantId: string }> {
  const suffix = randomUUID().slice(0, 8);
  const product = await prisma.product.create({
    data: { name: `${TEST_PREFIX} ${suffix}`, slug: `${TEST_PREFIX}-${suffix}`, categoryId, isActive: true },
  });
  createdProductIds.push(product.id);
  const variant = await prisma.productVariant.create({
    data: { productId: product.id, sku: `${TEST_PREFIX}-${suffix}`, color: "Black", size: "M", weightGrams: 500 },
  });
  createdVariantIds.push(variant.id);
  await prisma.inventory.create({ data: { variantId: variant.id, warehouseId, quantityAvailable, quantityReserved } });
  return { variantId: variant.id };
}

describe("admin inventory: RBAC", () => {
  it("allows a product_management_staff (has MANAGE_INVENTORY) to list inventory", async () => {
    const token = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const res = await request(app).get("/api/v1/admin/inventory").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it("403s an order_processing_staff (no MANAGE_INVENTORY) on /admin/inventory", async () => {
    const token = await loginAdmin("orders@woobe.in", "Staff@12345");
    const res = await request(app).get("/api/v1/admin/inventory").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe("admin inventory: list + low-stock filter", () => {
  it("lists a variant's stock levels and flags it low-stock once at/under the threshold", async () => {
    const token = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${token}` };
    const { variantId } = await createTestVariant(3, 0);

    const res = await request(app).get("/api/v1/admin/inventory").set(auth).query({ lowStockOnly: "true", pageSize: 100 });
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { variantId: string }) => i.variantId)).toContain(variantId);
  });
});

describe("admin inventory: manual adjustment", () => {
  it("restocks a variant and records an audit log entry", async () => {
    const token = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${token}` };
    const { variantId } = await createTestVariant(10, 2);

    const res = await request(app).post(`/api/v1/admin/inventory/${variantId}/adjust`).set(auth).send({ delta: 5, reason: "Supplier restock" });

    expect(res.status).toBe(200);
    expect(res.body.quantityAvailable).toBe(15);

    const inventory = await prisma.inventory.findFirstOrThrow({ where: { variantId } });
    expect(inventory.quantityAvailable).toBe(15);

    const auditLog = await prisma.adminAuditLog.findFirstOrThrow({ where: { entityId: variantId, action: "INVENTORY_ADJUSTED" } });
    expect(auditLog.metadata).toMatchObject({ delta: 5, reason: "Supplier restock", newQuantityAvailable: 15 });
  });

  it("rejects an adjustment that would make available stock negative — never writes, never logs", async () => {
    const token = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${token}` };
    const { variantId } = await createTestVariant(5, 0);

    const res = await request(app).post(`/api/v1/admin/inventory/${variantId}/adjust`).set(auth).send({ delta: -10, reason: "Miscount fix" });

    expect(res.status).toBe(422);
    const inventory = await prisma.inventory.findFirstOrThrow({ where: { variantId } });
    expect(inventory.quantityAvailable).toBe(5); // unchanged
    const auditLogCount = await prisma.adminAuditLog.count({ where: { entityId: variantId } });
    expect(auditLogCount).toBe(0);
  });

  it("rejects an adjustment that would drop available stock below what's already reserved", async () => {
    const token = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${token}` };
    const { variantId } = await createTestVariant(10, 8);

    const res = await request(app).post(`/api/v1/admin/inventory/${variantId}/adjust`).set(auth).send({ delta: -5, reason: "Miscount fix" });

    expect(res.status).toBe(422);
  });

  it("rejects a zero-delta adjustment at the validation layer", async () => {
    const token = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${token}` };
    const { variantId } = await createTestVariant(10, 0);

    const res = await request(app).post(`/api/v1/admin/inventory/${variantId}/adjust`).set(auth).send({ delta: 0, reason: "no-op" });
    expect(res.status).toBe(400);
  });
});
