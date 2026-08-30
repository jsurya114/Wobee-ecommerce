import { describe, expect, it, vi } from "vitest";
import { OtpInvalidError, OtpMaxAttemptsError, OtpResendCooldownError } from "../../domain/errors/otp.errors";
import { OtpCodeService } from "../../infrastructure/services/otp-code.service";
import type { AuthRepositoryPort, EmailVerificationRecord } from "../ports/auth-repository.port";
import type { OtpNotifierPort } from "../ports/otp-notifier.port";
import { ResendRegistrationOtpUseCase } from "./resend-registration-otp.use-case";

function record(overrides: Partial<EmailVerificationRecord> = {}): EmailVerificationRecord {
  return {
    email: "asha@example.com",
    codeHash: "old",
    name: "Asha Rao",
    phone: null,
    passwordHash: "bcrypt$hash",
    expiresAt: new Date(Date.now() + 60_000),
    consumedAt: null,
    attempts: 0,
    resendCount: 0,
    lastSentAt: new Date(Date.now() - 60_000), // past the cooldown by default
    ...overrides,
  };
}

function build(rec: EmailVerificationRecord | null) {
  const authRepository = {
    findEmailVerificationByEmail: vi.fn().mockResolvedValue(rec),
    refreshEmailVerification: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuthRepositoryPort;
  const otpNotifier: OtpNotifierPort = {
    sendRegistrationOtp: vi.fn().mockResolvedValue(undefined),
  };
  const useCase = new ResendRegistrationOtpUseCase(authRepository, new OtpCodeService(), otpNotifier);
  return { useCase, authRepository, otpNotifier };
}

describe("ResendRegistrationOtpUseCase", () => {
  it("no pending row -> OtpInvalidError", async () => {
    const { useCase } = build(null);
    await expect(useCase.execute({ email: "asha@example.com" })).rejects.toBeInstanceOf(OtpInvalidError);
  });

  it("within the cooldown -> OtpResendCooldownError with a positive retryAfter", async () => {
    const { useCase } = build(record({ lastSentAt: new Date() }));
    const err = await useCase.execute({ email: "asha@example.com" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OtpResendCooldownError);
    expect((err as OtpResendCooldownError).retryAfterSeconds).toBeGreaterThan(0);
  });

  it("resend cap reached -> OtpMaxAttemptsError", async () => {
    const { useCase } = build(record({ resendCount: 5 }));
    await expect(useCase.execute({ email: "asha@example.com" })).rejects.toBeInstanceOf(OtpMaxAttemptsError);
  });

  it("verify-attempt cap already burned -> OtpMaxAttemptsError (no fresh code)", async () => {
    const { useCase, authRepository } = build(record({ attempts: 10 }));
    await expect(useCase.execute({ email: "asha@example.com" })).rejects.toBeInstanceOf(OtpMaxAttemptsError);
    expect(authRepository.refreshEmailVerification).not.toHaveBeenCalled();
  });

  it("past the cooldown -> writes a fresh code + expiry and notifies", async () => {
    const { useCase, authRepository, otpNotifier } = build(record());

    const result = await useCase.execute({ email: "asha@example.com" });

    const call = (authRepository.refreshEmailVerification as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.email).toBe("asha@example.com");
    expect(call.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(call.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(otpNotifier.sendRegistrationOtp).toHaveBeenCalledTimes(1);
    expect(result.devCode).toMatch(/^\d{4}$/);
  });
});
