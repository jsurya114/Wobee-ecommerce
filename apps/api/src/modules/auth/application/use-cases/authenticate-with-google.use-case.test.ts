import { describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "../../../../shared/errors";
import {
  GoogleAccountConflictError,
  GoogleEmailUnverifiedError,
  GoogleNotConfiguredError,
  GoogleTokenInvalidError,
} from "../../domain/errors/google-auth.errors";
import { JwtService } from "../../infrastructure/services/jwt.service";
import { RefreshTokenService } from "../../infrastructure/services/refresh-token.service";
import type { AuthRepositoryPort } from "../ports/auth-repository.port";
import type { GoogleIdentity, GoogleIdTokenVerifierPort } from "../ports/google-id-token-verifier.port";
import { AuthenticateWithGoogleUseCase } from "./authenticate-with-google.use-case";

const IDENTITY: GoogleIdentity = {
  sub: "google-sub-1",
  email: "asha@example.com",
  emailVerified: true,
  name: "Asha Rao",
};

function userEntity(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "u1",
    email: "asha@example.com",
    name: "Asha Rao",
    role: "CUSTOMER",
    phone: null,
    isActive: true,
    ...overrides,
  };
}

/** Hand-written fake — real Google ID tokens can't be minted in tests, and google-auth-library should not be mocked at the module level (that would test nothing real). See journal.md's testing-strategy note for this module. */
class FakeGoogleIdTokenVerifier implements GoogleIdTokenVerifierPort {
  constructor(
    private readonly result: GoogleIdentity | (() => never),
  ) {}

  async verify(): Promise<GoogleIdentity> {
    if (typeof this.result === "function") {
      return this.result();
    }
    return this.result;
  }
}

function build(opts: {
  identity?: GoogleIdentity | (() => never);
  existingByGoogle?: unknown | null;
  existingByEmail?: unknown | null;
} = {}) {
  const authRepository = {
    findUserByGoogleSubject: vi.fn().mockResolvedValue(opts.existingByGoogle ?? null),
    findUserByEmail: vi.fn().mockResolvedValue(opts.existingByEmail ?? null),
    createUserWithGoogle: vi.fn().mockResolvedValue(userEntity()),
    createRefreshToken: vi.fn().mockResolvedValue({
      id: "rt1",
      userId: "u1",
      expiresAt: new Date(),
      revokedAt: null,
    }),
  } as unknown as AuthRepositoryPort;

  const verifier = new FakeGoogleIdTokenVerifier(opts.identity ?? IDENTITY);
  const useCase = new AuthenticateWithGoogleUseCase(
    authRepository,
    verifier,
    new JwtService(),
    new RefreshTokenService(),
  );
  return { useCase, authRepository };
}

describe("AuthenticateWithGoogleUseCase", () => {
  it("logs in an existing GOOGLE-linked user (matching sub), isNewUser=false", async () => {
    const { useCase, authRepository } = build({ existingByGoogle: userEntity() });

    const result = await useCase.execute("raw-credential");

    expect(result.isNewUser).toBe(false);
    expect(result.user.id).toBe("u1");
    expect(typeof result.accessToken).toBe("string");
    expect(typeof result.refreshToken).toBe("string");
    expect(authRepository.createUserWithGoogle).not.toHaveBeenCalled();
  });

  it("a deactivated existing GOOGLE account -> ForbiddenError", async () => {
    const { useCase } = build({ existingByGoogle: userEntity({ isActive: false }) });
    await expect(useCase.execute("raw-credential")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("no existing GOOGLE credential, no existing user by email -> creates a new user, isNewUser=true", async () => {
    const { useCase, authRepository } = build({ existingByGoogle: null, existingByEmail: null });

    const result = await useCase.execute("raw-credential");

    expect(result.isNewUser).toBe(true);
    expect(authRepository.createUserWithGoogle).toHaveBeenCalledWith({
      email: IDENTITY.email,
      name: IDENTITY.name,
      providerSubject: IDENTITY.sub,
    });
    expect(typeof result.accessToken).toBe("string");
  });

  it("no existing GOOGLE credential, but the email already belongs to a PASSWORD/OTP account -> GoogleAccountConflictError, never creates a user", async () => {
    const { useCase, authRepository } = build({
      existingByGoogle: null,
      existingByEmail: userEntity({ id: "existing-password-user" }),
    });

    await expect(useCase.execute("raw-credential")).rejects.toBeInstanceOf(GoogleAccountConflictError);
    expect(authRepository.createUserWithGoogle).not.toHaveBeenCalled();
  });

  it("two different Google subs sharing the same email: the second hits the conflict path, never linked to the first's account", async () => {
    // Sub A: no existing account by email -> creates user A.
    const { useCase: useCaseA, authRepository: repoA } = build({
      identity: { ...IDENTITY, sub: "sub-A" },
      existingByGoogle: null,
      existingByEmail: null,
    });
    const resultA = await useCaseA.execute("credential-a");
    expect(resultA.isNewUser).toBe(true);
    expect(repoA.createUserWithGoogle).toHaveBeenCalledWith(
      expect.objectContaining({ providerSubject: "sub-A" }),
    );

    // Sub B: same email, but findUserByGoogleSubject("sub-B") finds nothing
    // (it's a different sub), and findUserByEmail now finds A's account ->
    // conflict, never silently linked to A.
    const { useCase: useCaseB, authRepository: repoB } = build({
      identity: { ...IDENTITY, sub: "sub-B" },
      existingByGoogle: null,
      existingByEmail: userEntity({ id: "user-from-sub-A" }),
    });
    await expect(useCaseB.execute("credential-b")).rejects.toBeInstanceOf(GoogleAccountConflictError);
    expect(repoB.createUserWithGoogle).not.toHaveBeenCalled();
  });

  it("propagates GoogleTokenInvalidError from the verifier unchanged", async () => {
    const { useCase } = build({
      identity: () => {
        throw new GoogleTokenInvalidError();
      },
    });
    await expect(useCase.execute("bad-credential")).rejects.toBeInstanceOf(GoogleTokenInvalidError);
  });

  it("propagates GoogleEmailUnverifiedError from the verifier unchanged", async () => {
    const { useCase } = build({
      identity: () => {
        throw new GoogleEmailUnverifiedError();
      },
    });
    await expect(useCase.execute("credential")).rejects.toBeInstanceOf(GoogleEmailUnverifiedError);
  });

  it("propagates GoogleNotConfiguredError from the verifier unchanged", async () => {
    const { useCase } = build({
      identity: () => {
        throw new GoogleNotConfiguredError();
      },
    });
    await expect(useCase.execute("credential")).rejects.toBeInstanceOf(GoogleNotConfiguredError);
  });
});
