import { describe, expect, it, vi } from "vitest";
import type { EmailVerificationRecord } from "../ports/auth-repository.port";
import type { AuthRepositoryPort } from "../ports/auth-repository.port";
import { OtpExpiredError, OtpInvalidError, OtpMaxAttemptsError } from "../../domain/errors/otp.errors";
import { MAX_VERIFY_ATTEMPTS } from "../../domain/otp.policy";
import { JwtService } from "../../infrastructure/services/jwt.service";
import { OtpCodeService } from "../../infrastructure/services/otp-code.service";
import { RefreshTokenService } from "../../infrastructure/services/refresh-token.service";
import { VerifyRegistrationOtpUseCase } from "./verify-registration-otp.use-case";

const otpService = new OtpCodeService();
const CODE = "4829";

function record(overrides: Partial<EmailVerificationRecord> = {}): EmailVerificationRecord {
  return {
    email: "asha@example.com",
    codeHash: otpService.hash(CODE),
    name: "Asha Rao",
    phone: null,
    passwordHash: "bcrypt$hash",
    expiresAt: new Date(Date.now() + 60_000),
    consumedAt: null,
    attempts: 0,
    resendCount: 0,
    lastSentAt: new Date(),
    ...overrides,
  };
}

function build(rec: EmailVerificationRecord | null) {
  const authRepository = {
    findEmailVerificationByEmail: vi.fn().mockResolvedValue(rec),
    incrementEmailVerificationAttempts: vi.fn().mockResolvedValue(undefined),
    createUserWithPassword: vi.fn().mockResolvedValue({
      id: "u1",
      email: "asha@example.com",
      name: "Asha Rao",
      role: "CUSTOMER",
      phone: null,
      isActive: true,
    }),
    deleteEmailVerification: vi.fn().mockResolvedValue(undefined),
    createRefreshToken: vi.fn().mockResolvedValue({
      id: "rt1",
      userId: "u1",
      expiresAt: new Date(),
      revokedAt: null,
    }),
  } as unknown as AuthRepositoryPort;
  const useCase = new VerifyRegistrationOtpUseCase(
    authRepository,
    otpService,
    new JwtService(),
    new RefreshTokenService(),
  );
  return { useCase, authRepository };
}

describe("VerifyRegistrationOtpUseCase", () => {
  it("no pending row -> OtpInvalidError", async () => {
    const { useCase } = build(null);
    await expect(useCase.execute({ email: "asha@example.com", code: CODE })).rejects.toBeInstanceOf(OtpInvalidError);
  });

  it("expired row -> OtpExpiredError", async () => {
    const { useCase } = build(record({ expiresAt: new Date(Date.now() - 1000) }));
    await expect(useCase.execute({ email: "asha@example.com", code: CODE })).rejects.toBeInstanceOf(OtpExpiredError);
  });

  it("attempts already exhausted -> OtpMaxAttemptsError, no increment", async () => {
    const { useCase, authRepository } = build(record({ attempts: MAX_VERIFY_ATTEMPTS }));
    await expect(useCase.execute({ email: "asha@example.com", code: CODE })).rejects.toBeInstanceOf(
      OtpMaxAttemptsError,
    );
    expect(authRepository.incrementEmailVerificationAttempts).not.toHaveBeenCalled();
  });

  it("wrong code with attempts left -> increments then OtpInvalidError", async () => {
    const { useCase, authRepository } = build(record({ attempts: 2 }));
    await expect(useCase.execute({ email: "asha@example.com", code: "0000" })).rejects.toBeInstanceOf(OtpInvalidError);
    expect(authRepository.incrementEmailVerificationAttempts).toHaveBeenCalledWith("asha@example.com");
    expect(authRepository.createUserWithPassword).not.toHaveBeenCalled();
  });

  it("wrong code that hits the cap -> increments then OtpMaxAttemptsError", async () => {
    const { useCase } = build(record({ attempts: MAX_VERIFY_ATTEMPTS - 1 }));
    await expect(useCase.execute({ email: "asha@example.com", code: "0000" })).rejects.toBeInstanceOf(
      OtpMaxAttemptsError,
    );
  });

  it("correct code -> creates the user from the row, deletes it, returns a token pair", async () => {
    const { useCase, authRepository } = build(record());

    const result = await useCase.execute({
      email: "asha@example.com",
      code: CODE,
    });

    expect(authRepository.createUserWithPassword).toHaveBeenCalledWith({
      email: "asha@example.com",
      name: "Asha Rao",
      phone: undefined,
      passwordHash: "bcrypt$hash",
    });
    expect(authRepository.deleteEmailVerification).toHaveBeenCalledWith("asha@example.com");
    expect(result.user.id).toBe("u1");
    expect(typeof result.accessToken).toBe("string");
    expect(typeof result.refreshToken).toBe("string");
  });
});
