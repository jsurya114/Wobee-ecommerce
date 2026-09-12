import type { MailerPort } from "../../../../shared/email/mailer.port";
import { renderRegistrationOtpEmail } from "../../../../shared/email/templates";
import { OTP_TTL_MS } from "../../domain/otp.policy";
import type { OtpNotifierPort } from "../../application/ports/otp-notifier.port";

/**
 * Real registration-OTP email — SYNCHRONOUS (the user is on the screen
 * waiting for the code; must not depend on the BullMQ worker). Now a thin
 * adapter over the shared `MailerPort` + shared branded template, so the
 * transport config and the HTML live in exactly one place
 * (`shared/email/`), not duplicated here. Wired in `auth.module.ts` only
 * when `SMTP_HOST` is set; `DevOtpNotifier` otherwise. Contract unchanged:
 * resolve on delivery, THROW on failure (so the API reports an SMTP
 * problem to the user immediately).
 */
export class SmtpOtpNotifier implements OtpNotifierPort {
  constructor(private readonly mailer: MailerPort) {}

  async sendRegistrationOtp({ email, code }: { email: string; code: string; expiresAt: Date }): Promise<void> {
    const expiresMinutes = Math.round(OTP_TTL_MS / 60000);
    const { subject, html, text } = renderRegistrationOtpEmail({ code, expiresMinutes });
    await this.mailer.send({ to: email, subject, html, text });
  }
}
