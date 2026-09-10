import { describe, expect, it, vi } from "vitest";
import { SmtpOtpNotifier } from "./smtp-otp-notifier";
import { SmtpPasswordResetNotifier } from "./smtp-password-reset-notifier";
import { OTP_TTL_MS } from "../../domain/otp.policy";
import type { MailerPort } from "../../../../shared/email/mailer.port";

const expiresMinutes = Math.round(OTP_TTL_MS / 60000);

describe("SmtpOtpNotifier (synchronous registration OTP)", () => {
  it("renders the branded registration template and sends it to the given address", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const mailer: MailerPort = { send };
    await new SmtpOtpNotifier(mailer).sendRegistrationOtp({ email: "asha@example.com", code: "4821", expiresAt: new Date() });

    expect(send).toHaveBeenCalledTimes(1);
    const msg = send.mock.calls[0]![0];
    expect(msg.to).toBe("asha@example.com");
    expect(msg.subject).toBe("4821 is your Woobe verification code");
    expect(msg.html).toContain("4821");
    expect(msg.text).toContain("4821");
    expect(msg.text).toContain(`${expiresMinutes} minutes`);
  });

  it("propagates a mailer failure so the API can report it to the user synchronously", async () => {
    const mailer: MailerPort = { send: vi.fn().mockRejectedValue(new Error("SMTP 535")) };
    await expect(
      new SmtpOtpNotifier(mailer).sendRegistrationOtp({ email: "a@a.com", code: "1111", expiresAt: new Date() }),
    ).rejects.toThrow("SMTP 535");
  });
});

describe("SmtpPasswordResetNotifier (synchronous reset OTP)", () => {
  it("renders the reset-specific template", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await new SmtpPasswordResetNotifier({ send }).sendPasswordResetOtp({
      email: "asha@example.com",
      code: "9090",
      expiresAt: new Date(),
    });
    const msg = send.mock.calls[0]![0];
    expect(msg.subject).toBe("9090 is your Woobe password reset code");
    expect(msg.html).toMatch(/reset your Woobe password/i);
  });
});
