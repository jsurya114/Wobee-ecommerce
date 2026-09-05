import { describe, expect, it, vi } from "vitest";
import { GoogleTokenInvalidError } from "../../domain/errors/google-auth.errors";
import type { AuthRepositoryPort } from "../ports/auth-repository.port";
import type { GoogleIdentity, GoogleIdTokenVerifierPort } from "../ports/google-id-token-verifier.port";
import { LinkGoogleAccountUseCase } from "./link-google-account.use-case";

const IDENTITY: GoogleIdentity = {
  sub: "google-sub-1",
  email: "asha@example.com",
  emailVerified: true,
  name: "Asha Rao",
};

function build(identity: GoogleIdentity | (() => never) = IDENTITY) {
  const authRepository = {
    linkGoogleAccount: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuthRepositoryPort;

  const googleVerifier: GoogleIdTokenVerifierPort = {
    verify: vi.fn(async () => {
      if (typeof identity === "function") return identity();
      return identity;
    }),
  };

  const useCase = new LinkGoogleAccountUseCase(authRepository, googleVerifier);
  return { useCase, authRepository, googleVerifier };
}

describe("LinkGoogleAccountUseCase", () => {
  it("verifies the credential then links the CALLER's userId (never a body-supplied id) to the verified sub", async () => {
    const { useCase, authRepository, googleVerifier } = build();

    await useCase.execute("caller-user-id", "raw-credential");

    expect(googleVerifier.verify).toHaveBeenCalledWith("raw-credential");
    expect(authRepository.linkGoogleAccount).toHaveBeenCalledWith("caller-user-id", IDENTITY.sub);
  });

  it("propagates a verifier error unchanged, never calls linkGoogleAccount", async () => {
    const { useCase, authRepository } = build(() => {
      throw new GoogleTokenInvalidError();
    });

    await expect(useCase.execute("caller-user-id", "bad-credential")).rejects.toBeInstanceOf(
      GoogleTokenInvalidError,
    );
    expect(authRepository.linkGoogleAccount).not.toHaveBeenCalled();
  });
});
