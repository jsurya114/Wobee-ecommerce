import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

/**
 * Integration tests against the REAL test database (mirrors wishlist's/
 * collections' own *.integration.test.ts files) — Week 2 Day 3 Customer
 * Profile + Address Management (week2 (1).md §6–7).
 */

const TEST_PREFIX = "users-test";
const app = createApp();

const createdUserEmails: string[] = [];

afterAll(async () => {
  if (createdUserEmails.length > 0) {
    // Address cascades off User's onDelete: Cascade.
    await prisma.user.deleteMany({ where: { email: { in: createdUserEmails } } });
  }
  await prisma.$disconnect();
});

async function registerCustomer(name = "Users Tester"): Promise<{ accessToken: string; email: string }> {
  const email = `${TEST_PREFIX}-${crypto.randomUUID()}@test.woobe.internal`;
  createdUserEmails.push(email);
  const res = await request(app).post("/api/v1/auth/register").send({ name, email, password: "Passw0rd1" });
  expect(res.status).toBe(201);
  return { accessToken: res.body.accessToken as string, email };
}

const validAddress = {
  fullName: "Asha Rao",
  phone: "9876543210",
  line1: "12 MG Road",
  city: "Bengaluru",
  state: "Karnataka",
  pincode: "560001",
};

describe("users: profile", () => {
  it("GET /users/me returns the caller's own profile, no password hash or tokens", async () => {
    const { accessToken } = await registerCustomer("Profile Viewer");
    const res = await request(app).get("/api/v1/users/me").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: "Profile Viewer", role: "CUSTOMER" });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.user.accessToken).toBeUndefined();
    expect(res.body.user.refreshToken).toBeUndefined();
  });

  it("GET /users/me without a token is rejected with 401", async () => {
    const res = await request(app).get("/api/v1/users/me");
    expect(res.status).toBe(401);
  });

  it("PATCH /users/me updates the name, persisted for subsequent reads", async () => {
    const { accessToken } = await registerCustomer("Old Name");
    const patchRes = await request(app)
      .patch("/api/v1/users/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "New Name" });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.user.name).toBe("New Name");

    const meRes = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${accessToken}`);
    expect(meRes.body.user.name).toBe("New Name");
  });

  it("PATCH /users/me rejects a too-short name with 400, not a raw 500", async () => {
    const { accessToken } = await registerCustomer();
    const res = await request(app).patch("/api/v1/users/me").set("Authorization", `Bearer ${accessToken}`).send({ name: "A" });
    expect(res.status).toBe(400);
  });

  it("PATCH /users/me silently drops an email field — email/phone aren't editable this way (no approved verification flow)", async () => {
    const { accessToken, email } = await registerCustomer();
    const res = await request(app)
      .patch("/api/v1/users/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "Still Valid Name", email: "hijacked@test.woobe.internal" });
    expect(res.status).toBe(200);
    const meRes = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${accessToken}`);
    expect(meRes.body.user.email).toBe(email);
  });
});

describe("users: addresses — create / default rules", () => {
  it("a customer's first address is always the default, even if isDefault:false was sent", async () => {
    const { accessToken } = await registerCustomer();
    const res = await request(app)
      .post("/api/v1/users/me/addresses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ ...validAddress, isDefault: false });
    expect(res.status).toBe(201);
    expect(res.body.address.isDefault).toBe(true);
  });

  it("a second address respects the caller's own isDefault:false, first stays default", async () => {
    const { accessToken } = await registerCustomer();
    await request(app).post("/api/v1/users/me/addresses").set("Authorization", `Bearer ${accessToken}`).send(validAddress);
    const second = await request(app)
      .post("/api/v1/users/me/addresses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ ...validAddress, line1: "45 Brigade Road", isDefault: false });
    expect(second.status).toBe(201);
    expect(second.body.address.isDefault).toBe(false);

    const listRes = await request(app).get("/api/v1/users/me/addresses").set("Authorization", `Bearer ${accessToken}`);
    const defaults = listRes.body.addresses.filter((a: { isDefault: boolean }) => a.isDefault);
    expect(defaults).toHaveLength(1);
  });

  it("creating a new address with isDefault:true unsets the previous default — exactly one default at all times", async () => {
    const { accessToken } = await registerCustomer();
    const first = await request(app).post("/api/v1/users/me/addresses").set("Authorization", `Bearer ${accessToken}`).send(validAddress);
    const second = await request(app)
      .post("/api/v1/users/me/addresses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ ...validAddress, line1: "45 Brigade Road", isDefault: true });
    expect(second.body.address.isDefault).toBe(true);

    const listRes = await request(app).get("/api/v1/users/me/addresses").set("Authorization", `Bearer ${accessToken}`);
    const defaults = listRes.body.addresses.filter((a: { isDefault: boolean }) => a.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(second.body.address.id);
    expect(defaults[0].id).not.toBe(first.body.address.id);
  });

  it("rejects a missing required field with 400, not a raw 500", async () => {
    const { accessToken } = await registerCustomer();
    const { line1: _omitted, ...incomplete } = validAddress;
    const res = await request(app).post("/api/v1/users/me/addresses").set("Authorization", `Bearer ${accessToken}`).send(incomplete);
    expect(res.status).toBe(400);
  });

  it("rejects an invalid pincode with 400", async () => {
    const { accessToken } = await registerCustomer();
    const res = await request(app)
      .post("/api/v1/users/me/addresses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ ...validAddress, pincode: "12345" });
    expect(res.status).toBe(400);
  });
});

describe("users: addresses — list / update / delete", () => {
  it("updates an existing address's fields", async () => {
    const { accessToken } = await registerCustomer();
    const created = await request(app).post("/api/v1/users/me/addresses").set("Authorization", `Bearer ${accessToken}`).send(validAddress);
    const res = await request(app)
      .patch(`/api/v1/users/me/addresses/${created.body.address.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ city: "Mysuru" });
    expect(res.status).toBe(200);
    expect(res.body.address.city).toBe("Mysuru");
    expect(res.body.address.line1).toBe(validAddress.line1); // untouched fields survive a partial update
  });

  it("deletes a non-default address without disturbing the default", async () => {
    const { accessToken } = await registerCustomer();
    const first = await request(app).post("/api/v1/users/me/addresses").set("Authorization", `Bearer ${accessToken}`).send(validAddress);
    const second = await request(app)
      .post("/api/v1/users/me/addresses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ ...validAddress, line1: "45 Brigade Road", isDefault: false });

    const delRes = await request(app)
      .delete(`/api/v1/users/me/addresses/${second.body.address.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(delRes.status).toBe(204);

    const listRes = await request(app).get("/api/v1/users/me/addresses").set("Authorization", `Bearer ${accessToken}`);
    expect(listRes.body.addresses).toHaveLength(1);
    expect(listRes.body.addresses[0].id).toBe(first.body.address.id);
    expect(listRes.body.addresses[0].isDefault).toBe(true);
  });

  it("deleting the default address promotes the oldest remaining address to default", async () => {
    const { accessToken } = await registerCustomer();
    const first = await request(app).post("/api/v1/users/me/addresses").set("Authorization", `Bearer ${accessToken}`).send(validAddress);
    const second = await request(app)
      .post("/api/v1/users/me/addresses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ ...validAddress, line1: "45 Brigade Road", isDefault: false });
    expect(first.body.address.isDefault).toBe(true);

    await request(app).delete(`/api/v1/users/me/addresses/${first.body.address.id}`).set("Authorization", `Bearer ${accessToken}`);

    const listRes = await request(app).get("/api/v1/users/me/addresses").set("Authorization", `Bearer ${accessToken}`);
    expect(listRes.body.addresses).toHaveLength(1);
    expect(listRes.body.addresses[0].id).toBe(second.body.address.id);
    expect(listRes.body.addresses[0].isDefault).toBe(true);
  });

  it("deleting the only address leaves an empty list, no error", async () => {
    const { accessToken } = await registerCustomer();
    const created = await request(app).post("/api/v1/users/me/addresses").set("Authorization", `Bearer ${accessToken}`).send(validAddress);
    const delRes = await request(app)
      .delete(`/api/v1/users/me/addresses/${created.body.address.id}`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(delRes.status).toBe(204);

    const listRes = await request(app).get("/api/v1/users/me/addresses").set("Authorization", `Bearer ${accessToken}`);
    expect(listRes.body.addresses).toHaveLength(0);
  });

  it("POST .../default sets the target as the sole default", async () => {
    const { accessToken } = await registerCustomer();
    const first = await request(app).post("/api/v1/users/me/addresses").set("Authorization", `Bearer ${accessToken}`).send(validAddress);
    const second = await request(app)
      .post("/api/v1/users/me/addresses")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ ...validAddress, line1: "45 Brigade Road", isDefault: false });

    const res = await request(app)
      .post(`/api/v1/users/me/addresses/${second.body.address.id}/default`)
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.address.isDefault).toBe(true);

    const listRes = await request(app).get("/api/v1/users/me/addresses").set("Authorization", `Bearer ${accessToken}`);
    const defaults = listRes.body.addresses.filter((a: { isDefault: boolean }) => a.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(second.body.address.id);
    void first;
  });
});

describe("users: addresses — authorization (a customer can't reach another customer's addresses)", () => {
  it("customer B's address list stays empty despite customer A's addresses", async () => {
    const customerA = await registerCustomer();
    const customerB = await registerCustomer();
    await request(app).post("/api/v1/users/me/addresses").set("Authorization", `Bearer ${customerA.accessToken}`).send(validAddress);

    const res = await request(app).get("/api/v1/users/me/addresses").set("Authorization", `Bearer ${customerB.accessToken}`);
    expect(res.body.addresses).toHaveLength(0);
  });

  it("customer B cannot update customer A's address by id (404, not success)", async () => {
    const customerA = await registerCustomer();
    const customerB = await registerCustomer();
    const created = await request(app)
      .post("/api/v1/users/me/addresses")
      .set("Authorization", `Bearer ${customerA.accessToken}`)
      .send(validAddress);

    const res = await request(app)
      .patch(`/api/v1/users/me/addresses/${created.body.address.id}`)
      .set("Authorization", `Bearer ${customerB.accessToken}`)
      .send({ city: "Hijacked" });
    expect(res.status).toBe(404);
  });

  it("customer B cannot delete customer A's address by id (404, not success)", async () => {
    const customerA = await registerCustomer();
    const customerB = await registerCustomer();
    const created = await request(app)
      .post("/api/v1/users/me/addresses")
      .set("Authorization", `Bearer ${customerA.accessToken}`)
      .send(validAddress);

    const res = await request(app)
      .delete(`/api/v1/users/me/addresses/${created.body.address.id}`)
      .set("Authorization", `Bearer ${customerB.accessToken}`);
    expect(res.status).toBe(404);

    const listRes = await request(app).get("/api/v1/users/me/addresses").set("Authorization", `Bearer ${customerA.accessToken}`);
    expect(listRes.body.addresses).toHaveLength(1); // customer A's address survives the attempted cross-account delete
  });

  it("customer B cannot set customer A's address as default (404, not success)", async () => {
    const customerA = await registerCustomer();
    const customerB = await registerCustomer();
    const created = await request(app)
      .post("/api/v1/users/me/addresses")
      .set("Authorization", `Bearer ${customerA.accessToken}`)
      .send(validAddress);

    const res = await request(app)
      .post(`/api/v1/users/me/addresses/${created.body.address.id}/default`)
      .set("Authorization", `Bearer ${customerB.accessToken}`);
    expect(res.status).toBe(404);
  });

  it("all address routes reject an unauthenticated caller with 401", async () => {
    const res = await request(app).get("/api/v1/users/me/addresses");
    expect(res.status).toBe(401);
  });
});
