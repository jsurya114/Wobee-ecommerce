import { describe, expect, it, vi } from "vitest";
import { OtpMaxAttemptsError, OtpResendCooldownError } from "../../domain/errors/otp.errors";
import { OtpCodeService } from "../../infrastructure/services/otp-code.service";
import type { AuthRepositoryPort, PasswordResetRecord } from "../ports/auth-repository.port";
import type { PasswordResetNotifierPort } from "../ports/password-reset-notifier.port";
import { ForgotPasswordUseCase } from "./forgot-password.use-case";

const INPUT = { email: "asha@example.com" };

function resetRecord(overrides: Partial<PasswordResetRecord> = {}): PasswordResetRecord {
  return {
    email: "asha@example.com",
    userId: "u1",
    codeHash: "old",
    expiresAt: new Date(Date.now() + 60_000),
    consumedAt: null,
    attempts: 0,
    resendCount: 0,
    lastSentAt: new Date(Date.now() - 60_000), // past the cooldown by default
    ...overrides,
  };
}

function build(existingUser = true, pending: PasswordResetRecord | null = null) {
  const authRepository = {
    findUserByEmail: vi.fn().mockResolvedValue(existingUser ? { id: "u1", email: INPUT.email } : null),
    findPasswordResetByEmail: vi.fn().mockResolvedValue(pending),
    upsertPasswordReset: vi.fn().mockResolvedValue(undefined),
    refreshPasswordReset: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuthRepositoryPort;
  const notifier: PasswordResetNotifierPort = {
    sendPasswordResetOtp: vi.fn().mockResolvedValue(undefined),
  };
  const useCase = new ForgotPasswordUseCase(authRepository, new OtpCodeService(), notifier);
  return { useCase, authRepository, notifier };
}

describe("ForgotPasswordUseCase", () => {
  it("unknown email -> plausible challenge, nothing persisted or sent, no dev code", async () => {
    const { useCase, authRepository, notifier } = build(false);

    const result = await useCase.execute(INPUT);

    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(result.resendAvailableAt.getTime()).toBeGreaterThan(Date.now());
    expect(result.devCode).toBeUndefined();
    expect(authRepository.upsertPasswordReset).not.toHaveBeenCalled();
    expect(authRepository.refreshPasswordReset).not.toHaveBeenCalled();
    expect(notifier.sendPasswordResetOtp).not.toHaveBeenCalled();
  });

  it("known email, no prior row -> upserts a hashed code, notifies once, returns a dev code outside production", async () => {
    const { useCase, authRepository, notifier } = build(true);

    const result = await useCase.execute(INPUT);

    const call = (authRepository.upsertPasswordReset as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.email).toBe(INPUT.email);
    expect(call.userId).toBe("u1");
    expect(call.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(call.expiresAt.getTime()).toBeGreaterThan(Date.now());

    expect(notifier.sendPasswordResetOtp).toHaveBeenCalledTimes(1);
    const sent = (notifier.sendPasswordResetOtp as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(sent.code).toMatch(/^\d{4}$/);
    expect(new OtpCodeService().hash(sent.code)).toBe(call.codeHash);
    expect(result.devCode).toBe(sent.code);
  });

  it("re-request over a live row refreshes it without resetting attempts", async () => {
    const { useCase, authRepository } = build(true, resetRecord({ attempts: 7 }));

    await useCase.execute(INPUT);

    expect(authRepository.upsertPasswordReset).not.toHaveBeenCalled();
    const call = (authRepository.refreshPasswordReset as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(call.email).toBe(INPUT.email);
    expect(call.codeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(call).not.toHaveProperty("attempts");
  });

  it("re-request inside the resend cooldown is rejected", async () => {
    const { useCase } = build(true, resetRecord({ lastSentAt: new Date() }));
    await expect(useCase.execute(INPUT)).rejects.toBeInstanceOf(OtpResendCooldownError);
  });

  it("re-request after the verify-attempt cap is burned is rejected", async () => {
    const { useCase, authRepository } = build(true, resetRecord({ attempts: 10 }));
    await expect(useCase.execute(INPUT)).rejects.toBeInstanceOf(OtpMaxAttemptsError);
    expect(authRepository.refreshPasswordReset).not.toHaveBeenCalled();
    expect(authRepository.upsertPasswordReset).not.toHaveBeenCalled();
  });

  it("re-request over an expired row mints a genuinely fresh one (counters zeroed)", async () => {
    const { useCase, authRepository } = build(
      true,
      resetRecord({ attempts: 9, expiresAt: new Date(Date.now() - 1_000) }),
    );

    await useCase.execute(INPUT);

    expect(authRepository.refreshPasswordReset).not.toHaveBeenCalled();
    expect(authRepository.upsertPasswordReset).toHaveBeenCalledTimes(1);
  });
});
