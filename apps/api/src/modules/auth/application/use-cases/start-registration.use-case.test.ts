import { describe, expect, it, vi } from "vitest";
import { ConflictError } from "../../../../shared/errors";
import { OtpMaxAttemptsError, OtpResendCooldownError } from "../../domain/errors/otp.errors";
import { OtpCodeService } from "../../infrastructure/services/otp-code.service";
import type { AuthRepositoryPort, EmailVerificationRecord } from "../ports/auth-repository.port";
import type { OtpNotifierPort } from "../ports/otp-notifier.port";
import { StartRegistrationUseCase } from "./start-registration.use-case";

const INPUT = {
  name: "Asha Rao",
  email: "asha@example.com",
  phone: undefined,
  password: "Passw0rd",
};

function pendingRecord(overrides: Partial<EmailVerificationRecord> = {}): EmailVerificationRecord {
  return {
    email: "asha@example.com",
    codeHash: "old",
    name: "Asha Rao",
    phone: null,
    passwordHash: "bcrypt$old",
    expiresAt: new Date(Date.now() + 60_000),
    consumedAt: null,
    attempts: 0,
    resendCount: 0,
    lastSentAt: new Date(Date.now() - 60_000), // past the cooldown by default
    ...overrides,
  };
}

function build(existingUser = false, pending: EmailVerificationRecord | null = null) {
  const authRepository = {
    findUserByEmail: vi.fn().mockResolvedValue(existingUser ? { id: "u1" } : null),
    findEmailVerificationByEmail: vi.fn().mockResolvedValue(pending),
    upsertEmailVerification: vi.fn().mockResolvedValue(undefined),
    refreshEmailVerification: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuthRepositoryPort;
  const bcryptService = {
    hash: vi.fn().mockResolvedValue("bcrypt$hash"),
    compare: vi.fn(),
  };
  const otpNotifier: OtpNotifierPort = {
    sendRegistrationOtp: vi.fn().mockResolvedValue(undefined),
  };
  const useCase = new StartRegistrationUseCase(authRepository, bcryptService, new OtpCodeService(), otpNotifier);
  return { useCase, authRepository, bcryptService, otpNotifier };
}

describe("StartRegistrationUseCase", () => {
  it("rejects an email that already has an account", async () => {
    const { useCase, authRepository } = build(true);
    await expect(useCase.execute(INPUT)).rejects.toBeInstanceOf(ConflictError);
    expect(authRepository.upsertEmailVerification).not.toHaveBeenCalled();
  });

  it("stashes the bcrypt hash + a hashed code, notifies once, and returns a dev code outside production", async () => {
    const { useCase, authRepository, otpNotifier } = build();

    const result = await useCase.execute(INPUT);

    const call = (authRepository.upsertEmailVerification as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.email).toBe("asha@example.com");
    expect(call.passwordHash).toBe("bcrypt$hash");
    expect(call.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(call.expiresAt.getTime()).toBeGreaterThan(Date.now());

    expect(otpNotifier.sendRegistrationOtp).toHaveBeenCalledTimes(1);
    const sent = (otpNotifier.sendRegistrationOtp as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(sent.code).toMatch(/^\d{4}$/);
    // the stored hash is sha256(the sent code)
    expect(new OtpCodeService().hash(sent.code)).toBe(call.codeHash);

    // NODE_ENV is "test" in this suite, so the code round-trips for the browser.
    expect(result.devCode).toBe(sent.code);
    expect(result.resendAvailableAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("re-start over a live pending row refreshes it without resetting attempts", async () => {
    const { useCase, authRepository } = build(false, pendingRecord({ attempts: 7 }));

    await useCase.execute(INPUT);

    expect(authRepository.upsertEmailVerification).not.toHaveBeenCalled();
    const call = (authRepository.refreshEmailVerification as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.email).toBe("asha@example.com");
    expect(call.passwordHash).toBe("bcrypt$hash");
    expect(call.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(call).not.toHaveProperty("attempts");
  });

  it("re-start inside the resend cooldown is rejected", async () => {
    const { useCase } = build(false, pendingRecord({ lastSentAt: new Date() }));
    await expect(useCase.execute(INPUT)).rejects.toBeInstanceOf(OtpResendCooldownError);
  });

  it("re-start after the verify-attempt cap is burned is rejected", async () => {
    const { useCase, authRepository } = build(false, pendingRecord({ attempts: 10 }));
    await expect(useCase.execute(INPUT)).rejects.toBeInstanceOf(OtpMaxAttemptsError);
    expect(authRepository.refreshEmailVerification).not.toHaveBeenCalled();
    expect(authRepository.upsertEmailVerification).not.toHaveBeenCalled();
  });

  it("re-start over an expired row mints a genuinely fresh one (counters zeroed)", async () => {
    const { useCase, authRepository } = build(
      false,
      pendingRecord({ attempts: 9, expiresAt: new Date(Date.now() - 1_000) }),
    );

    await useCase.execute(INPUT);

    expect(authRepository.refreshEmailVerification).not.toHaveBeenCalled();
    expect(authRepository.upsertEmailVerification).toHaveBeenCalledTimes(1);
  });
});
