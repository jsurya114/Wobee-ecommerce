import { AuthMethod, prisma, Role } from "@woobe/database";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";
import { ConflictError } from "../../shared/errors";
import { AuthRepository } from "./infrastructure/repositories/auth.repository";
import { JwtService } from "./infrastructure/services/jwt.service";

/**
 * Added by the regression/coverage-verification pass (2026-09-05) on top of
 * Agent 1's "Continue with Google" work, following this codebase's existing
 * integration-test conventions (auth.integration.test.ts): real DB, unique
 * email prefix, afterAll cleanup. Kept in its OWN file rather than appended
 * to auth.integration.test.ts, which a Security reviewer and a
 * Clean-Architecture reviewer are independently reviewing in this same
 * round — this file touches none of their lines.
 *
 * These three gaps can't be exercised through the public HTTP surface in
 * this test env (GOOGLE_CLIENT_ID is unset, so the real Google verifier is
 * never wired — see auth.integration.test.ts's "auth: google" block), so a
 * Google-only account is seeded DIRECTLY via prisma, mirroring how other
 * integration tests in this codebase seed fixture rows the API itself can't
 * produce.
 */

const TEST_EMAIL_PREFIX = "google-gap-integration";
const uniqueEmail = () => `${TEST_EMAIL_PREFIX}-${crypto.randomUUID()}@test.woobe.internal`;

const app = createApp();
const authRepository = new AuthRepository();
const jwtService = new JwtService();

/** Seeds a user with ONLY a GOOGLE AuthCredential row (no PASSWORD row at all) — the account shape a real "Continue with Google" signup produces. */
async function createGoogleOnlyUser(overrides: { isActive?: boolean } = {}) {
  const email = uniqueEmail();
  const user = await prisma.user.create({
    data: {
      email,
      name: "Google Only User",
      role: Role.CUSTOMER,
      isActive: overrides.isActive ?? true,
      authCredentials: {
        create: {
          method: AuthMethod.GOOGLE,
          providerSubject: `sub-${crypto.randomUUID()}`,
        },
      },
    },
  });
  return user;
}

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: TEST_EMAIL_PREFIX } } });
  await prisma.$disconnect();
});

describe("google-only account shape: /auth/me", () => {
  it("a user created via Google (no PASSWORD credential row at all) can still GET /auth/me and get a normal profile back", async () => {
    const user = await createGoogleOnlyUser();
    // Every fixture in this file is CUSTOMER — signed directly rather than
    // cast from Prisma's Role (packages/database) to avoid colliding with
    // JwtService's own Role (packages/types), which JS's "ADMIN" isn't part of.
    const accessToken = jwtService.signAccessToken({ sub: user.id, role: "CUSTOMER" });

    const res = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: user.id, email: user.email, role: "CUSTOMER" });
    expect(res.body.user).not.toHaveProperty("passwordHash");
  });
});

describe("google-only account shape: /auth/login (password login on a passwordless account)", () => {
  it("a Google-created user attempting password login with any password fails cleanly with 401, not a crash (same `!record.passwordHash` branch as any password-less account)", async () => {
    const user = await createGoogleOnlyUser();

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: user.email, password: "SomeGuessedPassw0rd" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });
});

describe("linkGoogleAccount: cross-user conflict on the SAME providerSubject", () => {
  it("two different users, the second linking a providerSubject already linked to the first, gets ConflictError — the first user's link is left untouched", async () => {
    const userA = await prisma.user.create({
      data: { email: uniqueEmail(), name: "Link User A", role: Role.CUSTOMER },
    });
    const userB = await prisma.user.create({
      data: { email: uniqueEmail(), name: "Link User B", role: Role.CUSTOMER },
    });
    const sharedSub = `sub-${crypto.randomUUID()}`;

    await authRepository.linkGoogleAccount(userA.id, sharedSub);

    await expect(authRepository.linkGoogleAccount(userB.id, sharedSub)).rejects.toBeInstanceOf(ConflictError);

    const credentialB = await prisma.authCredential.findUnique({
      where: { userId_method: { userId: userB.id, method: AuthMethod.GOOGLE } },
    });
    expect(credentialB).toBeNull();

    const credentialA = await prisma.authCredential.findUnique({
      where: { userId_method: { userId: userA.id, method: AuthMethod.GOOGLE } },
    });
    expect(credentialA?.providerSubject).toBe(sharedSub);
  });
});
