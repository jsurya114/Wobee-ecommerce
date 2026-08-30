import { describe, expect, it, vi } from "vitest";
import { OtpExpiredError, OtpInvalidError, OtpMaxAttemptsError } from "../../domain/errors/otp.errors";
import { MAX_VERIFY_ATTEMPTS } from "../../domain/otp.policy";
import { OtpCodeService } from "../../infrastructure/services/otp-code.service";
import type { AuthRepositoryPort, PasswordResetRecord } from "../ports/auth-repository.port";
import { VerifyResetPasswordOtpUseCase } from "./verify-reset-password-otp.use-case";

const otpService = new OtpCodeService();
const CODE = "4829";

function record(overrides: Partial<PasswordResetRecord> = {}): PasswordResetRecord {
  return {
    email: "asha@example.com",
    userId: "u1",
    codeHash: otpService.hash(CODE),
    expiresAt: new Date(Date.now() + 60_000),
    consumedAt: null,
    attempts: 0,
    resendCount: 0,
    lastSentAt: new Date(),
    ...overrides,
  };
}

function build(rec: PasswordResetRecord | null) {
  const authRepository = {
    findPasswordResetByEmail: vi.fn().mockResolvedValue(rec),
    incrementPasswordResetAttempts: vi.fn().mockResolvedValue(undefined),
    // Deliberately not stubbed — the point of "verify" is that it mutates nothing.
    deletePasswordReset: vi.fn(),
    updateUserPassword: vi.fn(),
  } as unknown as AuthRepositoryPort;
  const useCase = new VerifyResetPasswordOtpUseCase(authRepository, otpService);
  return { useCase, authRepository };
}

describe("VerifyResetPasswordOtpUseCase", () => {
  it("no reset row -> OtpInvalidError", async () => {
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
    expect(authRepository.incrementPasswordResetAttempts).not.toHaveBeenCalled();
  });

  it("wrong code with attempts left -> increments then OtpInvalidError", async () => {
    const { useCase, authRepository } = build(record({ attempts: 2 }));
    await expect(useCase.execute({ email: "asha@example.com", code: "0000" })).rejects.toBeInstanceOf(OtpInvalidError);
    expect(authRepository.incrementPasswordResetAttempts).toHaveBeenCalledWith("asha@example.com");
  });

  it("wrong code that hits the cap -> increments then OtpMaxAttemptsError", async () => {
    const { useCase } = build(record({ attempts: MAX_VERIFY_ATTEMPTS - 1 }));
    await expect(useCase.execute({ email: "asha@example.com", code: "0000" })).rejects.toBeInstanceOf(
      OtpMaxAttemptsError,
    );
  });

  it("correct code -> resolves, and does not consume or mutate the row", async () => {
    const { useCase, authRepository } = build(record());

    await expect(useCase.execute({ email: "asha@example.com", code: CODE })).resolves.toBeUndefined();

    expect(authRepository.incrementPasswordResetAttempts).not.toHaveBeenCalled();
    expect(authRepository.deletePasswordReset).not.toHaveBeenCalled();
    expect(authRepository.updateUserPassword).not.toHaveBeenCalled();
  });
});
