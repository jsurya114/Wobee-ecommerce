import { env } from "../../config/env";
import type { EmailMessage } from "./email-message";
import type { MailerPort } from "./mailer.port";

/**
 * Stand-in `MailerPort` for when no SMTP endpoint is configured
 * (`SMTP_HOST` unset) — the same fallback posture the auth module has used
 * since the OTP feature landed. In `development` it logs a single line with
 * the recipient and subject ONLY, so a developer can see an email "fired"
 * without wiring real SMTP. It deliberately never logs the body or any code
 * inside it — OTP codes reach the developer through the auth use-case's own
 * `devCode` echo / `DevOtpNotifier`, not here. Silent in `test` (noise) and
 * `production` (a real adapter must be wired before launch).
 */
export class DevMailer implements MailerPort {
  async send(message: EmailMessage): Promise<void> {
    if (env.NODE_ENV === "development") {
      // `console.warn` is the dev-log channel the lint config permits until
      // a structured logger lands — this stands in for a real send.
      console.warn(`[email:dev] would send "${message.subject}" to ${message.to}`);
    }
  }
}
