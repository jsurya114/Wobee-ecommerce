import { describe, expect, it } from "vitest";
import { UnauthorizedError } from "../../../../shared/errors";
import type { UserEntity } from "../../domain/entities/user.entity";
import { JwtService } from "../../infrastructure/services/jwt.service";
import { RefreshTokenService } from "../../infrastructure/services/refresh-token.service";
import type { AuthRepositoryPort, RefreshTokenRecord } from "../ports/auth-repository.port";
import { RefreshTokenUseCase } from "./refresh-token.use-case";

/** In-memory stand-in for just the refresh-token part of AuthRepositoryPort. */
function fakeRepo(user: UserEntity) {
  const rows = new Map<string, RefreshTokenRecord & { tokenHash: string }>();
  let seq = 0;
  const repo = {
    async createRefreshToken(p: { userId: string; tokenHash: string; expiresAt: Date }) {
      const row = { id: `t${++seq}`, userId: p.userId, tokenHash: p.tokenHash, expiresAt: p.expiresAt, revokedAt: null, replacedByTokenId: null };
      rows.set(row.id, row);
      return row;
    },
    async findRefreshTokenByHash(hash: string) {
      return [...rows.values()].find((r) => r.tokenHash === hash) ?? null;
    },
    async findRefreshTokenById(id: string) {
      return rows.get(id) ?? null;
    },
    async rotateRefreshToken(id: string, replacedByTokenId: string) {
      const r = rows.get(id);
      if (!r || r.revokedAt) return false;
      Object.assign(r, { revokedAt: new Date(), replacedByTokenId });
      return true;
    },
    async revokeRefreshTokenIfActive(id: string) {
      const r = rows.get(id);
      if (!r || r.revokedAt) return false;
      r.revokedAt = new Date();
      return true;
    },
    async revokeRefreshToken(id: string) {
      await repo.revokeRefreshTokenIfActive(id);
    },
    async setRefreshTokenReplacement(id: string, replacedByTokenId: string) {
      rows.get(id)!.replacedByTokenId = replacedByTokenId;
    },
    async revokeAllRefreshTokensForUser(userId: string) {
      for (const r of rows.values()) if (r.userId === userId && !r.revokedAt) r.revokedAt = new Date();
    },
    async findUserById(id: string) {
      return id === user.id ? user : null;
    },
  };
  return { repo: repo as unknown as AuthRepositoryPort, rows };
}

const user: UserEntity = { id: "u1", email: "a@woobe.in", phone: null, name: "Admin", role: "SUPER_ADMIN", isActive: true };

async function setup(graceSeconds: number, u: UserEntity = user) {
  const refreshTokenService = new RefreshTokenService();
  const { repo, rows } = fakeRepo(u);
  const raw = refreshTokenService.generate();
  await repo.createRefreshToken({ userId: u.id, tokenHash: refreshTokenService.hash(raw), expiresAt: new Date(Date.now() + 86_400_000) });
  const useCase = new RefreshTokenUseCase(repo, new JwtService(), refreshTokenService, graceSeconds);
  const activeCount = () => [...rows.values()].filter((r) => !r.revokedAt).length;
  return { useCase, raw, rows, activeCount };
}

describe("RefreshTokenUseCase — reuse grace window", () => {
  it("grace 0 disables recovery: a rotated token whose replacement was never used just ends that session", async () => {
    const { useCase, raw, activeCount } = await setup(0);
    await useCase.execute(raw); // response "lost"
    await expect(useCase.execute(raw)).rejects.toThrow("Session expired");
    expect(activeCount()).toBe(0); // the unused replacement is retired — nobody holds a live token
  });

  it("after the window, a lost-response token ends only its own session — other devices survive", async () => {
    const { useCase, raw, rows, activeCount } = await setup(30);
    await useCase.execute(raw);
    const original = [...rows.values()][0]!;
    original.revokedAt = new Date(Date.now() - 60 * 60 * 1000); // tab reopened an hour later
    rows.set("other-device", { ...original, id: "other-device", tokenHash: "other", revokedAt: null, replacedByTokenId: null });
    await expect(useCase.execute(raw)).rejects.toThrow("Session expired");
    expect(activeCount()).toBe(1);
  });

  it("still catches theft when an attacker replays inside the window and then uses the session", async () => {
    const { useCase, raw, activeCount } = await setup(30);
    const legit = await useCase.execute(raw); // legit client rotates T1 -> T2 (not yet used)
    const attacker = await useCase.execute(raw); // attacker replays stolen T1 inside the window -> T3
    await useCase.execute(attacker.refreshToken); // attacker keeps using the session -> T4
    await expect(useCase.execute(legit.refreshToken)).rejects.toThrow("reuse detected"); // legit T2 comes back
    expect(activeCount()).toBe(0); // everyone, attacker included, is signed out
  });

  it("recovers a lost response once the replacement is unused, leaving exactly one live token", async () => {
    const { useCase, raw, activeCount } = await setup(30);
    await useCase.execute(raw); // response "lost"
    const recovered = await useCase.execute(raw);
    expect(recovered.refreshToken).toBeTruthy();
    expect(activeCount()).toBe(1);
    // A second lost response in the same window recovers the same way.
    await useCase.execute(raw);
    expect(activeCount()).toBe(1);
  });

  it("treats reuse as theft once the replacement has been used", async () => {
    const { useCase, raw, activeCount } = await setup(30);
    const rotated = await useCase.execute(raw);
    await useCase.execute(rotated.refreshToken); // legitimate client used its new token
    await expect(useCase.execute(raw)).rejects.toThrow("reuse detected");
    expect(activeCount()).toBe(0);
  });

  it("rejects a token revoked by logout without revoking the user's other sessions", async () => {
    const { useCase, raw, rows, activeCount } = await setup(30);
    const row = [...rows.values()][0]!;
    row.revokedAt = new Date(); // logout — no replacement recorded
    rows.set("other-session", { ...row, id: "other-session", tokenHash: "other", revokedAt: null, replacedByTokenId: null });
    await expect(useCase.execute(raw)).rejects.toBeInstanceOf(UnauthorizedError);
    expect(activeCount()).toBe(1); // the other device's session survives
  });

  it("still refuses a deactivated account inside the grace window", async () => {
    const inactive = { ...user, isActive: false };
    const { useCase, raw, rows } = await setup(30, inactive);
    const [row] = [...rows.values()];
    // Simulate a rotation that happened just before the account was deactivated.
    const replacement = { ...row!, id: "t-next", tokenHash: "other", revokedAt: null, replacedByTokenId: null };
    rows.set(replacement.id, replacement);
    Object.assign(row!, { revokedAt: new Date(), replacedByTokenId: replacement.id });
    await expect(useCase.execute(raw)).rejects.toThrow("deactivated");
  });
});
