import type { MailerPort } from "../../../../shared/email/mailer.port";
import { renderPasswordResetOtpEmail } from "../../../../shared/email/templates";
import { OTP_TTL_MS } from "../../domain/otp.policy";
import type { PasswordResetNotifierPort } from "../../application/ports/password-reset-notifier.port";

/**
 * Real forgot-password OTP email — SYNCHRONOUS, sibling of
 * `SmtpOtpNotifier`. Thin adapter over the shared `MailerPort` + shared
 * branded template (reset-specific copy). Wired in `auth.module.ts` only
 * when `SMTP_HOST` is set; `DevPasswordResetNotifier` otherwise.
 */
export class SmtpPasswordResetNotifier implements PasswordResetNotifierPort {
  constructor(private readonly mailer: MailerPort) {}

  async sendPasswordResetOtp({ email, code }: { email: string; code: string; expiresAt: Date }): Promise<void> {
    const expiresMinutes = Math.round(OTP_TTL_MS / 60000);
    const { subject, html, text } = renderPasswordResetOtpEmail({ code, expiresMinutes });
    await this.mailer.send({ to: email, subject, html, text });
  }
}
