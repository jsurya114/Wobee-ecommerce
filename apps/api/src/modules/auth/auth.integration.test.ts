import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";
import { MAX_VERIFY_ATTEMPTS } from "./domain/otp.policy";

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

/**
 * Registration is now the two-step email-OTP flow. This helper runs both
 * steps (start reads the dev code out of the response — NODE_ENV=test) and
 * returns the `verify` response, whose shape (`body.user` / `body.accessToken`
 * / `Set-Cookie`) matches what the old `POST /register` used to return, so
 * the login / refresh / reuse-detection blocks below need no other change.
 * Pass an `agent` when cookie persistence across requests matters.
 */
async function registerViaOtp(
  creds: { name: string; email: string; password: string },
  agent?: ReturnType<typeof request.agent>,
): Promise<request.Response> {
  const post = (path: string) => (agent ? agent.post(path) : request(app).post(path));
  const start = await post("/api/v1/auth/register/start").send(creds);
  if (start.status !== 200) return start;
  return post("/api/v1/auth/register/verify").send({
    email: creds.email,
    code: start.body.devCode,
  });
}

afterAll(async () => {
  await prisma.emailVerification.deleteMany({
    where: { email: { contains: TEST_EMAIL_PREFIX } },
  });
  await prisma.passwordReset.deleteMany({
    where: { email: { contains: TEST_EMAIL_PREFIX } },
  });
  await prisma.user.deleteMany({
    where: { email: { contains: TEST_EMAIL_PREFIX } },
  });
  await prisma.$disconnect();
});

describe("auth: register (email-OTP)", () => {
  it("start returns a pending challenge with a dev code and creates no user yet", async () => {
    const email = uniqueEmail();
    const res = await request(app)
      .post("/api/v1/auth/register/start")
      .send({ name: "Start User", email, password: "Passw0rd" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ pending: true });
    expect(typeof res.body.expiresAt).toBe("string");
    expect(typeof res.body.resendAvailableAt).toBe("string");
    expect(res.body.devCode).toMatch(/^\d{4}$/);
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
    expect(await prisma.emailVerification.findUnique({ where: { email } })).not.toBeNull();
  });

  it("verify with the correct code creates the account, sets a refresh cookie, and returns an access token", async () => {
    const email = uniqueEmail();
    const res = await registerViaOtp({
      name: "Verify User",
      email,
      password: "Passw0rd",
    });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(email);
    expect(res.body.user).not.toHaveProperty("passwordHash");
    expect(typeof res.body.accessToken).toBe("string");
    expect(res.headers["set-cookie"]?.[0]).toMatch(/^refresh_token=.*HttpOnly/);
    expect(await prisma.emailVerification.findUnique({ where: { email } })).toBeNull();
  });

  it("rejects starting registration for an email that already has an account with 409", async () => {
    const email = uniqueEmail();
    await registerViaOtp({ name: "First", email, password: "Passw0rd" });

    const res = await request(app)
      .post("/api/v1/auth/register/start")
      .send({ name: "Second", email, password: "Passw0rd" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("still supports the direct POST /register (non-OTP path for tooling/admin)", async () => {
    const email = uniqueEmail();
    const res = await request(app).post("/api/v1/auth/register").send({ name: "Direct", email, password: "Passw0rd" });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(email);
  });
});

describe("auth: register/verify", () => {
  it("rejects a wrong code with 422 and still creates no user", async () => {
    const email = uniqueEmail();
    await request(app).post("/api/v1/auth/register/start").send({ name: "Wrong Code", email, password: "Passw0rd" });

    const res = await request(app).post("/api/v1/auth/register/verify").send({ email, code: "0000" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("UNPROCESSABLE_ENTITY");
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  });

  it("rejects an expired code with 422", async () => {
    const email = uniqueEmail();
    const start = await request(app)
      .post("/api/v1/auth/register/start")
      .send({ name: "Expired", email, password: "Passw0rd" });
    await prisma.emailVerification.update({
      where: { email },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(app).post("/api/v1/auth/register/verify").send({ email, code: start.body.devCode });
    expect(res.status).toBe(422);
  });

  it(`burns the code after ${MAX_VERIFY_ATTEMPTS} wrong attempts`, async () => {
    const email = uniqueEmail();
    const start = await request(app)
      .post("/api/v1/auth/register/start")
      .send({ name: "Locked", email, password: "Passw0rd" });

    for (let i = 0; i < MAX_VERIFY_ATTEMPTS; i++) {
      await request(app).post("/api/v1/auth/register/verify").send({ email, code: "1111" });
    }
    // Even the correct code is now rejected.
    const res = await request(app).post("/api/v1/auth/register/verify").send({ email, code: start.body.devCode });
    expect(res.status).toBe(422);
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();

    // ...and a resend can't revive it, nor can a re-submitted start (the row
    // is dead until it expires — a 4-digit code's brute-force ceiling).
    await prisma.emailVerification.update({
      where: { email },
      data: { lastSentAt: new Date(Date.now() - 60_000) },
    });
    const resend = await request(app).post("/api/v1/auth/register/resend").send({ email });
    expect(resend.status).toBe(422);
    const restart = await request(app)
      .post("/api/v1/auth/register/start")
      .send({ name: "Locked", email, password: "Passw0rd" });
    expect(restart.status).toBe(422);
  });

  it("422s a verify with no prior start", async () => {
    const res = await request(app).post("/api/v1/auth/register/verify").send({ email: uniqueEmail(), code: "1234" });
    expect(res.status).toBe(422);
  });

  it("400s a malformed code", async () => {
    const res = await request(app).post("/api/v1/auth/register/verify").send({ email: uniqueEmail(), code: "123" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("auth: register/resend", () => {
  it("rejects an immediate resend (cooldown) with 422", async () => {
    const email = uniqueEmail();
    await request(app).post("/api/v1/auth/register/start").send({ name: "Cooldown", email, password: "Passw0rd" });

    const res = await request(app).post("/api/v1/auth/register/resend").send({ email });
    expect(res.status).toBe(422);
  });

  it("after the cooldown, a resent code works and the old one no longer does", async () => {
    const email = uniqueEmail();
    const start = await request(app)
      .post("/api/v1/auth/register/start")
      .send({ name: "Resend", email, password: "Passw0rd" });
    // Fast-forward past the cooldown.
    await prisma.emailVerification.update({
      where: { email },
      data: { lastSentAt: new Date(Date.now() - 60_000) },
    });

    const resend = await request(app).post("/api/v1/auth/register/resend").send({ email });
    expect(resend.status).toBe(200);
    expect(resend.body.devCode).toMatch(/^\d{4}$/);
    expect(resend.body.devCode).not.toBe(start.body.devCode);

    const oldCode = await request(app).post("/api/v1/auth/register/verify").send({ email, code: start.body.devCode });
    expect(oldCode.status).toBe(422);

    const newCode = await request(app).post("/api/v1/auth/register/verify").send({ email, code: resend.body.devCode });
    expect(newCode.status).toBe(201);
  });

  it("422s a resend with no prior start", async () => {
    const res = await request(app).post("/api/v1/auth/register/resend").send({ email: uniqueEmail() });
    expect(res.status).toBe(422);
  });
});

describe("auth: forgot / reset password (email-OTP)", () => {
  /** forgot -> reset with the emailed code; returns the reset response. */
  async function resetViaOtp(email: string, newPassword: string): Promise<request.Response> {
    const forgot = await request(app).post("/api/v1/auth/forgot-password").send({ email });
    if (forgot.status !== 200 || !forgot.body.devCode) return forgot;
    return request(app)
      .post("/api/v1/auth/reset-password")
      .send({ email, code: forgot.body.devCode, password: newPassword });
  }

  it("forgot returns a pending challenge with a dev code for an existing account", async () => {
    const email = uniqueEmail();
    await registerViaOtp({ name: "Forgot", email, password: "Passw0rd" });

    const res = await request(app).post("/api/v1/auth/forgot-password").send({ email });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ pending: true });
    expect(res.body.devCode).toMatch(/^\d{4}$/);
    expect(await prisma.passwordReset.findUnique({ where: { email } })).not.toBeNull();
  });

  it("forgot for an unknown email looks identical but persists/sends nothing (no enumeration)", async () => {
    const email = uniqueEmail();
    const res = await request(app).post("/api/v1/auth/forgot-password").send({ email });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ pending: true });
    expect(res.body).not.toHaveProperty("devCode");
    expect(await prisma.passwordReset.findUnique({ where: { email } })).toBeNull();
  });

  it("reset with the correct code changes the password, clears the row, and revokes existing sessions", async () => {
    const email = uniqueEmail();
    const register = await registerViaOtp({ name: "Reset", email, password: "Passw0rd" });
    const oldRefreshCookie = extractCookieHeader(register.headers["set-cookie"]);

    const reset = await resetViaOtp(email, "Newpass1");
    expect(reset.status).toBe(204);
    expect(await prisma.passwordReset.findUnique({ where: { email } })).toBeNull();

    // Old password no longer works; new one does.
    expect((await request(app).post("/api/v1/auth/login").send({ email, password: "Passw0rd" })).status).toBe(401);
    expect((await request(app).post("/api/v1/auth/login").send({ email, password: "Newpass1" })).status).toBe(200);

    // The refresh token issued before the reset is dead.
    const refreshAfter = await request(app).post("/api/v1/auth/refresh").set("Cookie", oldRefreshCookie).send();
    expect(refreshAfter.status).toBe(401);
  });

  it("reset-password/verify confirms a correct code with 204 without consuming it", async () => {
    const email = uniqueEmail();
    await registerViaOtp({ name: "VerifyStep", email, password: "Passw0rd" });
    const forgot = await request(app).post("/api/v1/auth/forgot-password").send({ email });

    const verify = await request(app)
      .post("/api/v1/auth/reset-password/verify")
      .send({ email, code: forgot.body.devCode });
    expect(verify.status).toBe(204);
    // Row still present, still usable — the code was not consumed.
    expect(await prisma.passwordReset.findUnique({ where: { email } })).not.toBeNull();

    const reset = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ email, code: forgot.body.devCode, password: "Newpass1" });
    expect(reset.status).toBe(204);
  });

  it("reset-password/verify rejects a wrong code with 422 and mutates nothing", async () => {
    const email = uniqueEmail();
    await registerViaOtp({ name: "VerifyWrong", email, password: "Passw0rd" });
    await request(app).post("/api/v1/auth/forgot-password").send({ email });

    const verify = await request(app)
      .post("/api/v1/auth/reset-password/verify")
      .send({ email, code: "0000" });
    expect(verify.status).toBe(422);
    expect((await request(app).post("/api/v1/auth/login").send({ email, password: "Passw0rd" })).status).toBe(200);
  });

  it("rejects a wrong code with 422 and leaves the password unchanged", async () => {
    const email = uniqueEmail();
    await registerViaOtp({ name: "WrongReset", email, password: "Passw0rd" });
    await request(app).post("/api/v1/auth/forgot-password").send({ email });

    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ email, code: "0000", password: "Newpass1" });
    expect(res.status).toBe(422);
    expect((await request(app).post("/api/v1/auth/login").send({ email, password: "Passw0rd" })).status).toBe(200);
  });

  it("422s a reset with no prior forgot", async () => {
    const email = uniqueEmail();
    await registerViaOtp({ name: "NoForgot", email, password: "Passw0rd" });
    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ email, code: "1234", password: "Newpass1" });
    expect(res.status).toBe(422);
  });

  it("400s a malformed code / weak password", async () => {
    const email = uniqueEmail();
    const short = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ email, code: "12", password: "Newpass1" });
    expect(short.status).toBe(400);
    const weak = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ email, code: "1234", password: "weak" });
    expect(weak.status).toBe(400);
  });

  it("rejects an immediate resend (cooldown), then a resent code works after it", async () => {
    const email = uniqueEmail();
    await registerViaOtp({ name: "ResendReset", email, password: "Passw0rd" });
    const forgot = await request(app).post("/api/v1/auth/forgot-password").send({ email });

    expect((await request(app).post("/api/v1/auth/reset-password/resend").send({ email })).status).toBe(422);

    await prisma.passwordReset.update({
      where: { email },
      data: { lastSentAt: new Date(Date.now() - 60_000) },
    });
    const resend = await request(app).post("/api/v1/auth/reset-password/resend").send({ email });
    expect(resend.status).toBe(200);
    expect(resend.body.devCode).not.toBe(forgot.body.devCode);

    // Old code is dead, new one resets.
    expect(
      (
        await request(app)
          .post("/api/v1/auth/reset-password")
          .send({ email, code: forgot.body.devCode, password: "Newpass1" })
      ).status,
    ).toBe(422);
    expect(
      (
        await request(app)
          .post("/api/v1/auth/reset-password")
          .send({ email, code: resend.body.devCode, password: "Newpass1" })
      ).status,
    ).toBe(204);
  });

  it(`burns the reset after ${MAX_VERIFY_ATTEMPTS} wrong attempts — even the right code then fails`, async () => {
    const email = uniqueEmail();
    await registerViaOtp({ name: "BurnReset", email, password: "Passw0rd" });
    const forgot = await request(app).post("/api/v1/auth/forgot-password").send({ email });

    for (let i = 0; i < MAX_VERIFY_ATTEMPTS; i++) {
      await request(app).post("/api/v1/auth/reset-password").send({ email, code: "1111", password: "Newpass1" });
    }
    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ email, code: forgot.body.devCode, password: "Newpass1" });
    expect(res.status).toBe(422);
    // Password never changed.
    expect((await request(app).post("/api/v1/auth/login").send({ email, password: "Passw0rd" })).status).toBe(200);
  });
});

describe("auth: login", () => {
  it("logs in with correct credentials", async () => {
    const email = uniqueEmail();
    await registerViaOtp({ name: "Login Test", email, password: "Passw0rd" });

    const res = await request(app).post("/api/v1/auth/login").send({ email, password: "Passw0rd" });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
    expect(typeof res.body.accessToken).toBe("string");
  });

  it("rejects a wrong password with 401, without revealing whether the account exists", async () => {
    const email = uniqueEmail();
    await registerViaOtp({ name: "Wrong Pw", email, password: "Passw0rd" });

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
    const registerRes = await registerViaOtp({
      name: "Me Test",
      email,
      password: "Passw0rd",
    });

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

    const registerRes = await registerViaOtp({ name: "Rotation Test", email, password: "Passw0rd" }, agent);
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

    const registerRes = await registerViaOtp({
      name: "Reuse Test",
      email,
      password: "Passw0rd",
    });
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
