import { describe, expect, it, vi } from "vitest";
import { OtpExpiredError, OtpInvalidError, OtpMaxAttemptsError } from "../../domain/errors/otp.errors";
import { MAX_VERIFY_ATTEMPTS } from "../../domain/otp.policy";
import { OtpCodeService } from "../../infrastructure/services/otp-code.service";
import type { AuthRepositoryPort, PasswordResetRecord } from "../ports/auth-repository.port";
import { ResetPasswordUseCase } from "./reset-password.use-case";

const otpService = new OtpCodeService();
const CODE = "4829";
const INPUT = { email: "asha@example.com", code: CODE, password: "NewPassw0rd" };

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
    updateUserPassword: vi.fn().mockResolvedValue(undefined),
    deletePasswordReset: vi.fn().mockResolvedValue(undefined),
    revokeAllRefreshTokensForUser: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuthRepositoryPort;
  const bcryptService = {
    hash: vi.fn().mockResolvedValue("bcrypt$new"),
    compare: vi.fn(),
  };
  const useCase = new ResetPasswordUseCase(authRepository, otpService, bcryptService);
  return { useCase, authRepository, bcryptService };
}

describe("ResetPasswordUseCase", () => {
  it("no reset row -> OtpInvalidError", async () => {
    const { useCase } = build(null);
    await expect(useCase.execute(INPUT)).rejects.toBeInstanceOf(OtpInvalidError);
  });

  it("expired row -> OtpExpiredError", async () => {
    const { useCase } = build(record({ expiresAt: new Date(Date.now() - 1000) }));
    await expect(useCase.execute(INPUT)).rejects.toBeInstanceOf(OtpExpiredError);
  });

  it("attempts already exhausted -> OtpMaxAttemptsError, no increment", async () => {
    const { useCase, authRepository } = build(record({ attempts: MAX_VERIFY_ATTEMPTS }));
    await expect(useCase.execute(INPUT)).rejects.toBeInstanceOf(OtpMaxAttemptsError);
    expect(authRepository.incrementPasswordResetAttempts).not.toHaveBeenCalled();
  });

  it("wrong code with attempts left -> increments then OtpInvalidError, no password write", async () => {
    const { useCase, authRepository } = build(record({ attempts: 2 }));
    await expect(useCase.execute({ ...INPUT, code: "0000" })).rejects.toBeInstanceOf(OtpInvalidError);
    expect(authRepository.incrementPasswordResetAttempts).toHaveBeenCalledWith("asha@example.com");
    expect(authRepository.updateUserPassword).not.toHaveBeenCalled();
  });

  it("wrong code that hits the cap -> increments then OtpMaxAttemptsError", async () => {
    const { useCase } = build(record({ attempts: MAX_VERIFY_ATTEMPTS - 1 }));
    await expect(useCase.execute({ ...INPUT, code: "0000" })).rejects.toBeInstanceOf(OtpMaxAttemptsError);
  });

  it("correct code -> hashes the new password, writes it, deletes the row, revokes every session", async () => {
    const { useCase, authRepository, bcryptService } = build(record());

    await useCase.execute(INPUT);

    expect(bcryptService.hash).toHaveBeenCalledWith("NewPassw0rd");
    expect(authRepository.updateUserPassword).toHaveBeenCalledWith("u1", "bcrypt$new");
    expect(authRepository.deletePasswordReset).toHaveBeenCalledWith("asha@example.com");
    expect(authRepository.revokeAllRefreshTokensForUser).toHaveBeenCalledWith("u1");
  });
});
