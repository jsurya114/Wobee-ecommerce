import { randomUUID } from "node:crypto";
import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

/**
 * Integration tests against the REAL test database — Staff Management
 * System (2026-09-06). Covers: RBAC (MANAGE_STAFF is super_admin-only),
 * create + invitation lifecycle (verify/activate/resend/expiry/replay/
 * wrong-code), role change (self-change rejected, tokens revoked, audit),
 * deactivate/reactivate (self-deactivation rejected, tokens revoked, login
 * blocked, audit), and the last-active-super-admin invariant under
 * concurrency. The admin-login rate limit fix bundled with this work has its
 * own dedicated test file (admin-auth-rate-limit.integration.test.ts) — that
 * test necessarily exhausts the shared `admin-auth:login` Redis bucket every
 * `loginAdmin()` call in THIS file also uses, so it can't safely share a
 * file with them.
 *
 * Wrapped in one `describe.sequential` — several tests here mutate shared,
 * cross-test state (the seeded admin@woobe.in account's role/active status,
 * a super-admin count invariant queried across the whole table), which is
 * only safe if this file's tests run one at a time, not interleaved (see
 * vitest.config.ts's own comment on same-file test concurrency).
 */
describe.sequential("admin staff", () => {

const TEST_PREFIX = "admin-staff-integration";
const app = createApp();
const createdUserIds: string[] = [];

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await prisma.adminAuditLog.deleteMany({ where: { OR: [{ actorId: { in: createdUserIds } }, { entityId: { in: createdUserIds } }] } });
    await prisma.staffInvitation.deleteMany({ where: { OR: [{ userId: { in: createdUserIds } }, { invitedById: { in: createdUserIds } }] } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.authCredential.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

async function loginAdmin(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/v1/admin/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

/** Creates a staff member via the real API (super_admin-created) and returns its devCode-bearing response. */
async function createStaff(actorToken: string, role: "SUPER_ADMIN" | "ORDER_PROCESSING_STAFF" | "PRODUCT_MANAGEMENT_STAFF") {
  const email = `${TEST_PREFIX}-${randomUUID()}@test.woobe.internal`;
  const res = await request(app)
    .post("/api/v1/admin/staff")
    .set("Authorization", `Bearer ${actorToken}`)
    .send({ name: "Test Staff", email, role });
  expect(res.status).toBe(201);
  createdUserIds.push(res.body.staff.id);
  return { id: res.body.staff.id as string, email, devCode: res.body.devCode as string };
}

/** Creates AND fully activates a staff member through the real invitation flow (verify + set password) — returns login-ready credentials. */
async function createActivatedStaff(actorToken: string, role: "SUPER_ADMIN" | "ORDER_PROCESSING_STAFF" | "PRODUCT_MANAGEMENT_STAFF") {
  const { id, email, devCode } = await createStaff(actorToken, role);
  const password = "Staff@12345";
  await request(app).post("/api/v1/staff/activate/verify").send({ email, code: devCode });
  const activateRes = await request(app).post("/api/v1/staff/activate").send({ email, code: devCode, password });
  expect(activateRes.status).toBe(204);
  return { id, email, password };
}

describe("admin staff: RBAC", () => {
  it("403s an order_processing_staff (no MANAGE_STAFF)", async () => {
    const token = await loginAdmin("orders@woobe.in", "Staff@12345");
    const res = await request(app).get("/api/v1/admin/staff").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("403s a product_management_staff (no MANAGE_STAFF)", async () => {
    const token = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const res = await request(app).get("/api/v1/admin/staff").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it("401s an unauthenticated request", async () => {
    const res = await request(app).get("/api/v1/admin/staff");
    expect(res.status).toBe(401);
  });

  it("allows a super_admin to list staff", async () => {
    const token = await loginAdmin("admin@woobe.in", "Admin@12345");
    const res = await request(app).get("/api/v1/admin/staff").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
  });
});

describe("admin staff: create + invitation lifecycle", () => {
  it("creates a staff member, sends an invitation, and audits both events", async () => {
    const token = await loginAdmin("admin@woobe.in", "Admin@12345");
    const { id, email, devCode } = await createStaff(token, "ORDER_PROCESSING_STAFF");

    expect(devCode).toMatch(/^\d{4}$/);

    const detailRes = await request(app).get(`/api/v1/admin/staff/${id}`).set("Authorization", `Bearer ${token}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.staff).toMatchObject({ email, role: "ORDER_PROCESSING_STAFF", status: "INVITED", isActive: true, lastLoginAt: null });

    const actions = await prisma.adminAuditLog.findMany({ where: { entityId: id }, orderBy: { createdAt: "asc" } });
    expect(actions.map((a) => a.action)).toEqual(["STAFF_CREATED", "STAFF_INVITATION_SENT"]);
  });

  it("rejects a duplicate email", async () => {
    const token = await loginAdmin("admin@woobe.in", "Admin@12345");
    const { email } = await createStaff(token, "ORDER_PROCESSING_STAFF");
    const res = await request(app)
      .post("/api/v1/admin/staff")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Dup", email, role: "ORDER_PROCESSING_STAFF" });
    expect(res.status).toBe(409);
  });

  it("rejects an unsupported/CUSTOMER role at the request-validation layer", async () => {
    const token = await loginAdmin("admin@woobe.in", "Admin@12345");
    const res = await request(app)
      .post("/api/v1/admin/staff")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Bad Role", email: `${TEST_PREFIX}-${randomUUID()}@test.woobe.internal`, role: "CUSTOMER" });
    expect(res.status).toBe(400);
  });

  it("cannot log in before activation — no credential exists yet", async () => {
    const token = await loginAdmin("admin@woobe.in", "Admin@12345");
    const { email } = await createStaff(token, "ORDER_PROCESSING_STAFF");
    const loginRes = await request(app).post("/api/v1/admin/auth/login").send({ email, password: "Whatever@123" });
    expect(loginRes.status).toBe(401);
  });

  it("rejects a wrong code, incrementing attempts, then accepts the right code (verify -> activate -> login)", async () => {
    const token = await loginAdmin("admin@woobe.in", "Admin@12345");
    const { id, email, devCode } = await createStaff(token, "ORDER_PROCESSING_STAFF");
    const wrongCode = devCode === "0000" ? "1111" : "0000";

    const wrongRes = await request(app).post("/api/v1/staff/activate/verify").send({ email, code: wrongCode });
    expect(wrongRes.status).toBe(422);

    const invitation = await prisma.staffInvitation.findUniqueOrThrow({ where: { userId: id } });
    expect(invitation.attempts).toBe(1);

    const verifyRes = await request(app).post("/api/v1/staff/activate/verify").send({ email, code: devCode });
    expect(verifyRes.status).toBe(204);

    const password = "Staff@12345";
    const activateRes = await request(app).post("/api/v1/staff/activate").send({ email, code: devCode, password });
    expect(activateRes.status).toBe(204);

    const acceptedAction = await prisma.adminAuditLog.findFirst({ where: { entityId: id, action: "STAFF_INVITATION_ACCEPTED" } });
    expect(acceptedAction).not.toBeNull();

    const loginRes = await request(app).post("/api/v1/admin/auth/login").send({ email, password });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.role).toBe("ORDER_PROCESSING_STAFF");

    const detailRes = await request(app).get(`/api/v1/admin/staff/${id}`).set("Authorization", `Bearer ${token}`);
    expect(detailRes.body.staff.status).toBe("ACTIVE");
    expect(new Date(detailRes.body.staff.lastLoginAt).toString()).not.toBe("Invalid Date");
  });

  it("rejects replay — the same code cannot activate twice", async () => {
    const token = await loginAdmin("admin@woobe.in", "Admin@12345");
    const { email, devCode } = await createStaff(token, "PRODUCT_MANAGEMENT_STAFF");
    const password = "Staff@12345";

    const first = await request(app).post("/api/v1/staff/activate").send({ email, code: devCode, password });
    expect(first.status).toBe(204);

    const replay = await request(app).post("/api/v1/staff/activate").send({ email, code: devCode, password });
    expect(replay.status).toBe(422);
  });

  it("rejects an expired invitation code", async () => {
    const token = await loginAdmin("admin@woobe.in", "Admin@12345");
    const { id, email, devCode } = await createStaff(token, "PRODUCT_MANAGEMENT_STAFF");
    await prisma.staffInvitation.update({ where: { userId: id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await request(app).post("/api/v1/staff/activate/verify").send({ email, code: devCode });
    expect(res.status).toBe(422);
  });

  it("resend: rejects within the cooldown window, then succeeds once the cooldown has passed", async () => {
    const token = await loginAdmin("admin@woobe.in", "Admin@12345");
    const { id } = await createStaff(token, "ORDER_PROCESSING_STAFF");

    const tooSoon = await request(app).post(`/api/v1/admin/staff/${id}/invitation/resend`).set("Authorization", `Bearer ${token}`);
    expect(tooSoon.status).toBe(422);

    await prisma.staffInvitation.update({ where: { userId: id }, data: { lastSentAt: new Date(Date.now() - 60_000) } });

    const res = await request(app).post(`/api/v1/admin/staff/${id}/invitation/resend`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.devCode).toMatch(/^\d{4}$/);

    const resentAction = await prisma.adminAuditLog.findFirst({ where: { entityId: id, action: "STAFF_INVITATION_RESENT" } });
    expect(resentAction).not.toBeNull();
  });

  it("resend: rejected once the account has already been activated", async () => {
    const token = await loginAdmin("admin@woobe.in", "Admin@12345");
    const { id } = await createActivatedStaff(token, "ORDER_PROCESSING_STAFF");
    const res = await request(app).post(`/api/v1/admin/staff/${id}/invitation/resend`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(409);
  });
});

describe("admin staff: role change", () => {
  it("changes a staff member's role, revokes their refresh tokens, invalidates their session, and audits it", async () => {
    const adminToken = await loginAdmin("admin@woobe.in", "Admin@12345");
    const staff = await createActivatedStaff(adminToken, "PRODUCT_MANAGEMENT_STAFF");

    const staffLoginRes = await request(app).post("/api/v1/admin/auth/login").send({ email: staff.email, password: staff.password });
    expect(staffLoginRes.status).toBe(200);
    const staffRefreshCookie = staffLoginRes.headers["set-cookie"];

    const changeRes = await request(app)
      .patch(`/api/v1/admin/staff/${staff.id}/role`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "ORDER_PROCESSING_STAFF" });
    expect(changeRes.status).toBe(200);
    expect(changeRes.body.staff.role).toBe("ORDER_PROCESSING_STAFF");

    // Old refresh token is revoked immediately — refresh now fails (§26 of the spec).
    const refreshRes = await request(app).post("/api/v1/admin/auth/refresh").set("Cookie", staffRefreshCookie!);
    expect(refreshRes.status).toBe(401);

    // A fresh login reflects the new role.
    const reloginRes = await request(app).post("/api/v1/admin/auth/login").send({ email: staff.email, password: staff.password });
    expect(reloginRes.status).toBe(200);
    expect(reloginRes.body.user.role).toBe("ORDER_PROCESSING_STAFF");

    const roleChangedAction = await prisma.adminAuditLog.findFirst({ where: { entityId: staff.id, action: "STAFF_ROLE_CHANGED" } });
    expect(roleChangedAction?.metadata).toMatchObject({ fromRole: "PRODUCT_MANAGEMENT_STAFF", toRole: "ORDER_PROCESSING_STAFF" });
  });

  it("rejects a self-role-change, even for a super_admin", async () => {
    const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: "admin@woobe.in" } });
    const adminToken = await loginAdmin("admin@woobe.in", "Admin@12345");
    const res = await request(app)
      .patch(`/api/v1/admin/staff/${adminUser.id}/role`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "ORDER_PROCESSING_STAFF" });
    expect(res.status).toBe(403);
  });

  it("rejects an unsupported role at the request-validation layer", async () => {
    const adminToken = await loginAdmin("admin@woobe.in", "Admin@12345");
    const staff = await createActivatedStaff(adminToken, "ORDER_PROCESSING_STAFF");
    const res = await request(app)
      .patch(`/api/v1/admin/staff/${staff.id}/role`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ role: "CUSTOMER" });
    expect(res.status).toBe(400);
  });

  it("403s a non-super_admin attempting a role change", async () => {
    const adminToken = await loginAdmin("admin@woobe.in", "Admin@12345");
    const target = await createActivatedStaff(adminToken, "ORDER_PROCESSING_STAFF");
    const nonAdminToken = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const res = await request(app)
      .patch(`/api/v1/admin/staff/${target.id}/role`)
      .set("Authorization", `Bearer ${nonAdminToken}`)
      .send({ role: "PRODUCT_MANAGEMENT_STAFF" });
    expect(res.status).toBe(403);
  });
});

describe("admin staff: deactivate / reactivate", () => {
  it("deactivates a staff member — refresh and new login are both rejected, then reactivating restores login (but not the old session)", async () => {
    const adminToken = await loginAdmin("admin@woobe.in", "Admin@12345");
    const staff = await createActivatedStaff(adminToken, "ORDER_PROCESSING_STAFF");

    const loginRes = await request(app).post("/api/v1/admin/auth/login").send({ email: staff.email, password: staff.password });
    const refreshCookie = loginRes.headers["set-cookie"];

    const deactivateRes = await request(app)
      .post(`/api/v1/admin/staff/${staff.id}/active`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: false });
    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.staff.status).toBe("DEACTIVATED");

    const refreshRes = await request(app).post("/api/v1/admin/auth/refresh").set("Cookie", refreshCookie!);
    expect(refreshRes.status).toBe(401);

    const loginWhileDeactivatedRes = await request(app).post("/api/v1/admin/auth/login").send({ email: staff.email, password: staff.password });
    expect(loginWhileDeactivatedRes.status).toBe(403);

    const reactivateRes = await request(app)
      .post(`/api/v1/admin/staff/${staff.id}/active`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: true });
    expect(reactivateRes.status).toBe(200);

    // The OLD session stays revoked even after reactivation.
    const staleRefreshRes = await request(app).post("/api/v1/admin/auth/refresh").set("Cookie", refreshCookie!);
    expect(staleRefreshRes.status).toBe(401);

    // A fresh login works again.
    const freshLoginRes = await request(app).post("/api/v1/admin/auth/login").send({ email: staff.email, password: staff.password });
    expect(freshLoginRes.status).toBe(200);

    const actions = await prisma.adminAuditLog.findMany({ where: { entityId: staff.id, action: { in: ["STAFF_DEACTIVATED", "STAFF_ACTIVATED"] } } });
    expect(actions.map((a) => a.action).sort()).toEqual(["STAFF_ACTIVATED", "STAFF_DEACTIVATED"]);
  });

  it("rejects self-deactivation, even for a super_admin", async () => {
    const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: "admin@woobe.in" } });
    const adminToken = await loginAdmin("admin@woobe.in", "Admin@12345");
    const res = await request(app)
      .post(`/api/v1/admin/staff/${adminUser.id}/active`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ isActive: false });
    expect(res.status).toBe(403);
  });

  it("403s a non-super_admin attempting to deactivate staff", async () => {
    const adminToken = await loginAdmin("admin@woobe.in", "Admin@12345");
    const target = await createActivatedStaff(adminToken, "ORDER_PROCESSING_STAFF");
    const nonAdminToken = await loginAdmin("orders@woobe.in", "Staff@12345");
    const res = await request(app)
      .post(`/api/v1/admin/staff/${target.id}/active`)
      .set("Authorization", `Bearer ${nonAdminToken}`)
      .send({ isActive: false });
    expect(res.status).toBe(403);
  });
});

describe("admin staff: last active super admin invariant", () => {
  it("never allows two concurrent deactivations to reduce active super admins to zero", async () => {
    const seedAdminToken = await loginAdmin("admin@woobe.in", "Admin@12345");
    const x = await createActivatedStaff(seedAdminToken, "SUPER_ADMIN");
    const y = await createActivatedStaff(seedAdminToken, "SUPER_ADMIN");

    // Snapshot every currently-active super admin (including the seeded
    // admin@woobe.in and anything left over from other describe blocks) so
    // this test can isolate itself to exactly {x, y} and restore everything
    // else afterward, regardless of what the race below does.
    const previouslyActiveSuperAdminIds = (
      await prisma.user.findMany({ where: { role: "SUPER_ADMIN", isActive: true }, select: { id: true } })
    ).map((u) => u.id);

    try {
      await prisma.user.updateMany({
        where: { role: "SUPER_ADMIN", isActive: true, id: { notIn: [x.id, y.id] } },
        data: { isActive: false },
      });

      const tokenX = await loginAdmin(x.email, x.password);
      const tokenY = await loginAdmin(y.email, y.password);

      // Two DIFFERENT super admins racing to deactivate EACH OTHER — the
      // scenario that would leave zero active super admins if unsynchronized.
      const [xDeactivatesY, yDeactivatesX] = await Promise.all([
        request(app).post(`/api/v1/admin/staff/${y.id}/active`).set("Authorization", `Bearer ${tokenX}`).send({ isActive: false }),
        request(app).post(`/api/v1/admin/staff/${x.id}/active`).set("Authorization", `Bearer ${tokenY}`).send({ isActive: false }),
      ]);

      const statuses = [xDeactivatesY.status, yDeactivatesX.status].sort();
      expect(statuses).toEqual([200, 409]); // exactly one wins, one is correctly rejected

      const stillActiveAmongPair = await prisma.user.count({ where: { id: { in: [x.id, y.id] }, isActive: true } });
      expect(stillActiveAmongPair).toBe(1); // never zero
    } finally {
      await prisma.user.updateMany({ where: { id: { in: previouslyActiveSuperAdminIds } }, data: { isActive: true } });
    }
  });
});
}); // describe.sequential("admin staff")
