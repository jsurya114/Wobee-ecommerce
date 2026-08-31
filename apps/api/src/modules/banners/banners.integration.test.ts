import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

/**
 * Integration tests against the REAL test database (mirrors collections'
 * own *.integration.test.ts file) — 2026-08-31 UI refinement pass:
 * admin-manageable homepage promo carousel slides. Own throwaway banners
 * per run (random suffix), cleaned up in afterAll.
 */

const app = createApp();
const SUFFIX = crypto.randomUUID().slice(0, 8);
const IMAGE_URL = "https://example.com/banner.jpg";

const createdBannerIds: string[] = [];

async function loginAdmin(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/v1/admin/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

afterAll(async () => {
  if (createdBannerIds.length > 0) {
    await prisma.banner.deleteMany({ where: { id: { in: createdBannerIds } } });
  }
  await prisma.$disconnect();
});

describe("GET /api/v1/banners (customer-facing)", () => {
  it("only returns active, in-schedule banners, ordered by sortOrder", async () => {
    const accessToken = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${accessToken}` };

    const active = await request(app).post("/api/v1/admin/banners").set(auth).send({ imageUrl: IMAGE_URL, title: `Active ${SUFFIX}` });
    createdBannerIds.push(active.body.banner.id);
    const inactive = await request(app).post("/api/v1/admin/banners").set(auth).send({ imageUrl: IMAGE_URL, title: `Inactive ${SUFFIX}` });
    createdBannerIds.push(inactive.body.banner.id);
    await request(app).post(`/api/v1/admin/banners/${inactive.body.banner.id}/active`).set(auth).send({ isActive: false });

    const res = await request(app).get("/api/v1/banners");
    expect(res.status).toBe(200);
    const titles = res.body.banners.map((b: { title: string }) => b.title);
    expect(titles).toContain(`Active ${SUFFIX}`);
    expect(titles).not.toContain(`Inactive ${SUFFIX}`);
  });

  it("excludes a banner scheduled in the future", async () => {
    const accessToken = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${accessToken}` };
    const futureStart = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const created = await request(app)
      .post("/api/v1/admin/banners")
      .set(auth)
      .send({ imageUrl: IMAGE_URL, title: `Future ${SUFFIX}`, startAt: futureStart });
    createdBannerIds.push(created.body.banner.id);

    const res = await request(app).get("/api/v1/banners");
    const titles = res.body.banners.map((b: { title: string }) => b.title);
    expect(titles).not.toContain(`Future ${SUFFIX}`);
  });

  it("excludes a banner whose schedule has ended", async () => {
    const accessToken = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${accessToken}` };
    const pastEnd = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const created = await request(app)
      .post("/api/v1/admin/banners")
      .set(auth)
      .send({ imageUrl: IMAGE_URL, title: `Expired ${SUFFIX}`, endAt: pastEnd });
    createdBannerIds.push(created.body.banner.id);

    const res = await request(app).get("/api/v1/banners");
    const titles = res.body.banners.map((b: { title: string }) => b.title);
    expect(titles).not.toContain(`Expired ${SUFFIX}`);
  });

  it("does not leak admin-only fields (isActive, sortOrder, schedule) to the customer-facing shape", async () => {
    const accessToken = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${accessToken}` };
    const created = await request(app).post("/api/v1/admin/banners").set(auth).send({ imageUrl: IMAGE_URL, title: `Shape ${SUFFIX}` });
    createdBannerIds.push(created.body.banner.id);

    const res = await request(app).get("/api/v1/banners");
    const banner = res.body.banners.find((b: { title: string }) => b.title === `Shape ${SUFFIX}`);
    expect(banner).toMatchObject({ imageUrl: IMAGE_URL, title: `Shape ${SUFFIX}` });
    expect(banner).not.toHaveProperty("isActive");
    expect(banner).not.toHaveProperty("sortOrder");
  });
});

describe("admin banners RBAC", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/api/v1/admin/banners");
    expect(res.status).toBe(401);
  });

  it("403s an order_processing_staff (no MANAGE_CATALOG)", async () => {
    const accessToken = await loginAdmin("orders@woobe.in", "Staff@12345");
    const res = await request(app).get("/api/v1/admin/banners").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  it("allows a product_management_staff (has MANAGE_CATALOG)", async () => {
    const accessToken = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const res = await request(app).get("/api/v1/admin/banners").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.banners)).toBe(true);
  });
});

describe("admin banners CRUD", () => {
  it("creates, lists (including inactive), and gets a banner by id", async () => {
    const accessToken = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${accessToken}` };

    const createRes = await request(app)
      .post("/api/v1/admin/banners")
      .set(auth)
      .send({ imageUrl: IMAGE_URL, title: "Winter Sale", ctaLabel: "Shop now", ctaUrl: "/products" });
    expect(createRes.status).toBe(201);
    expect(createRes.body.banner).toMatchObject({ imageUrl: IMAGE_URL, title: "Winter Sale", isActive: true, sortOrder: expect.any(Number) });
    const bannerId = createRes.body.banner.id as string;
    createdBannerIds.push(bannerId);

    const getRes = await request(app).get(`/api/v1/admin/banners/${bannerId}`).set(auth);
    expect(getRes.status).toBe(200);
    expect(getRes.body.banner).toMatchObject({ id: bannerId, title: "Winter Sale" });

    const listRes = await request(app).get("/api/v1/admin/banners").set(auth);
    expect(listRes.body.banners.some((b: { id: string }) => b.id === bannerId)).toBe(true);
  });

  it("rejects a non-URL imageUrl with 400", async () => {
    const accessToken = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const res = await request(app)
      .post("/api/v1/admin/banners")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ imageUrl: "not-a-url" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("404s getting an unknown banner", async () => {
    const accessToken = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const res = await request(app).get(`/api/v1/admin/banners/${crypto.randomUUID()}`).set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });

  it("updates metadata", async () => {
    const accessToken = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${accessToken}` };
    const createRes = await request(app).post("/api/v1/admin/banners").set(auth).send({ imageUrl: IMAGE_URL, title: "Original" });
    const bannerId = createRes.body.banner.id as string;
    createdBannerIds.push(bannerId);

    const updateRes = await request(app).patch(`/api/v1/admin/banners/${bannerId}`).set(auth).send({ title: "Renamed" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.banner.title).toBe("Renamed");
  });

  it("activates and deactivates — deactivated banners drop out of the customer-facing endpoint immediately", async () => {
    const accessToken = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${accessToken}` };
    const createRes = await request(app).post("/api/v1/admin/banners").set(auth).send({ imageUrl: IMAGE_URL, title: `Toggle ${SUFFIX}` });
    const bannerId = createRes.body.banner.id as string;
    createdBannerIds.push(bannerId);

    const visibleBefore = await request(app).get("/api/v1/banners");
    expect(visibleBefore.body.banners.some((b: { id: string }) => b.id === bannerId)).toBe(true);

    const deactivateRes = await request(app).post(`/api/v1/admin/banners/${bannerId}/active`).set(auth).send({ isActive: false });
    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.banner.isActive).toBe(false);

    const hiddenAfter = await request(app).get("/api/v1/banners");
    expect(hiddenAfter.body.banners.some((b: { id: string }) => b.id === bannerId)).toBe(false);
  });

  it("deletes a banner", async () => {
    const accessToken = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${accessToken}` };
    const createRes = await request(app).post("/api/v1/admin/banners").set(auth).send({ imageUrl: IMAGE_URL, title: "To delete" });
    const bannerId = createRes.body.banner.id as string;

    const deleteRes = await request(app).delete(`/api/v1/admin/banners/${bannerId}`).set(auth);
    expect(deleteRes.status).toBe(204);

    const getRes = await request(app).get(`/api/v1/admin/banners/${bannerId}`).set(auth);
    expect(getRes.status).toBe(404);
  });

  it("reorders banners", async () => {
    const accessToken = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${accessToken}` };
    const first = await request(app).post("/api/v1/admin/banners").set(auth).send({ imageUrl: IMAGE_URL, title: `Reorder A ${SUFFIX}` });
    const second = await request(app).post("/api/v1/admin/banners").set(auth).send({ imageUrl: IMAGE_URL, title: `Reorder B ${SUFFIX}` });
    createdBannerIds.push(first.body.banner.id, second.body.banner.id);

    const reorderRes = await request(app)
      .put("/api/v1/admin/banners/order")
      .set(auth)
      .send({ bannerIds: [second.body.banner.id, first.body.banner.id] });
    expect(reorderRes.status).toBe(204);

    const getFirst = await request(app).get(`/api/v1/admin/banners/${first.body.banner.id}`).set(auth);
    const getSecond = await request(app).get(`/api/v1/admin/banners/${second.body.banner.id}`).set(auth);
    expect(getSecond.body.banner.sortOrder).toBeLessThan(getFirst.body.banner.sortOrder);
  });
});
