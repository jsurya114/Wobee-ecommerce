import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

/**
 * Integration tests against the REAL test database (see vitest.config.ts —
 * DATABASE_URL points at woobe_test, migrated via `prisma migrate deploy`
 * before this file's tests run; see journal.md Day 2 entry for the one-time
 * setup command). Every test uses a unique email under a recognizable
 * prefix so runs never collide and afterAll can clean up precisely.
 */

const TEST_EMAIL_PREFIX = "day2-integration";
const uniqueEmail = () => `${TEST_EMAIL_PREFIX}-${crypto.randomUUID()}@test.woobe.internal`;

/** Set-Cookie -> a `Cookie` header value ("refresh_token=<value>"), dropping Path/HttpOnly/etc. attributes. */
function extractCookieHeader(setCookieHeader: string | string[] | undefined): string {
  const raw = Array.isArray(setCookieHeader)
    ? setCookieHeader.find((c) => c.startsWith("refresh_token="))
    : setCookieHeader;
  if (!raw?.startsWith("refresh_token=")) {
    throw new Error("Expected a refresh_token Set-Cookie header in the response");
  }
  return raw.split(";")[0]!;
}

const app = createApp();

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: TEST_EMAIL_PREFIX } } });
  await prisma.$disconnect();
});

describe("auth: register", () => {
  it("registers a user, sets a refresh cookie, and returns an access token", async () => {
    const email = uniqueEmail();
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ name: "Test User", email, password: "Passw0rd" });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(email);
    expect(res.body.user).not.toHaveProperty("passwordHash");
    expect(typeof res.body.accessToken).toBe("string");
    expect(res.headers["set-cookie"]?.[0]).toMatch(/^refresh_token=.*HttpOnly/);
  });

  it("rejects a duplicate email with 409", async () => {
    const email = uniqueEmail();
    await request(app).post("/api/v1/auth/register").send({ name: "First", email, password: "Passw0rd" });

    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ name: "Second", email, password: "Passw0rd" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });
});

describe("auth: login", () => {
  it("logs in with correct credentials", async () => {
    const email = uniqueEmail();
    await request(app).post("/api/v1/auth/register").send({ name: "Login Test", email, password: "Passw0rd" });

    const res = await request(app).post("/api/v1/auth/login").send({ email, password: "Passw0rd" });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
    expect(typeof res.body.accessToken).toBe("string");
  });

  it("rejects a wrong password with 401, without revealing whether the account exists", async () => {
    const email = uniqueEmail();
    await request(app).post("/api/v1/auth/register").send({ name: "Wrong Pw", email, password: "Passw0rd" });

    const wrongPw = await request(app).post("/api/v1/auth/login").send({ email, password: "WrongPass1" });
    const noSuchUser = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: uniqueEmail(), password: "WrongPass1" });

    expect(wrongPw.status).toBe(401);
    expect(noSuchUser.status).toBe(401);
    expect(wrongPw.body.error.code).toBe(noSuchUser.body.error.code);
  });
});

describe("auth: /me (protected route)", () => {
  it("rejects without a token", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns the current user with a valid access token", async () => {
    const email = uniqueEmail();
    const registerRes = await request(app)
      .post("/api/v1/auth/register")
      .send({ name: "Me Test", email, password: "Passw0rd" });

    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${registerRes.body.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
  });
});

describe("auth: refresh + logout (full session lifecycle)", () => {
  it("refreshes to a new token pair, rotates the cookie, then logout revokes it", async () => {
    const email = uniqueEmail();
    const agent = request.agent(app); // persists cookies across requests, like a browser

    const registerRes = await agent
      .post("/api/v1/auth/register")
      .send({ name: "Rotation Test", email, password: "Passw0rd" });
    const originalRefreshCookie = extractCookieHeader(registerRes.headers["set-cookie"]);

    const refreshRes = await agent.post("/api/v1/auth/refresh").send();
    expect(refreshRes.status).toBe(200);
    expect(typeof refreshRes.body.accessToken).toBe("string");
    // The REFRESH token's identity rotating is the actual security property —
    // access tokens with identical claims signed in the same second are
    // legitimately byte-identical (JWT signing is deterministic), so that's
    // not what's under test here.
    expect(extractCookieHeader(refreshRes.headers["set-cookie"])).not.toBe(originalRefreshCookie);

    // New access token works.
    const meRes = await agent.get("/api/v1/auth/me").set("Authorization", `Bearer ${refreshRes.body.accessToken}`);
    expect(meRes.status).toBe(200);

    // Logout revokes the (rotated) refresh token.
    const logoutRes = await agent.post("/api/v1/auth/logout").send();
    expect(logoutRes.status).toBe(204);

    // The now-revoked refresh cookie can no longer be used.
    const refreshAfterLogout = await agent.post("/api/v1/auth/refresh").send();
    expect(refreshAfterLogout.status).toBe(401);
  });

  it("detects refresh-token reuse and revokes every session for that user", async () => {
    const email = uniqueEmail();

    const registerRes = await request(app)
      .post("/api/v1/auth/register")
      .send({ name: "Reuse Test", email, password: "Passw0rd" });
    const originalCookie = extractCookieHeader(registerRes.headers["set-cookie"]);

    // Rotate it once — this revokes `originalCookie` server-side and issues a new one.
    const firstRefresh = await request(app).post("/api/v1/auth/refresh").set("Cookie", originalCookie).send();
    expect(firstRefresh.status).toBe(200);
    const rotatedCookie = extractCookieHeader(firstRefresh.headers["set-cookie"]);

    // Replay the original, now-revoked cookie — reuse detection should fire.
    const replay = await request(app).post("/api/v1/auth/refresh").set("Cookie", originalCookie).send();
    expect(replay.status).toBe(401);

    // Reuse detection revoked ALL sessions — even the legitimately-rotated one is now dead.
    const afterReuseDetected = await request(app).post("/api/v1/auth/refresh").set("Cookie", rotatedCookie).send();
    expect(afterReuseDetected.status).toBe(401);
  });
});
