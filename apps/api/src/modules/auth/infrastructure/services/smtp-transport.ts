import type { Transporter } from "nodemailer";
import { NodemailerMailer } from "../../../../shared/email/nodemailer-mailer";

/**
 * Historical helper — the auth OTP notifiers and the shared
 * `NodemailerEmailProvider` now both go through `shared/email`'s
 * `MailerPort` / `NodemailerMailer`, so nothing in auth constructs a raw
 * transport any more. This is kept ONLY because the `staff` module's
 * invitation-email notifier still imports `createSmtpTransport` (via
 * `auth.module.ts`'s re-export) and migrating that surface is out of scope
 * for the 2026-09-10 transactional-email sprint. It now delegates to the
 * single shared nodemailer construction so there is still exactly one
 * `nodemailer.createTransport` call in the codebase.
 *
 * Follow-up: migrate `staff`'s notifier onto `MailerPort` directly and
 * delete this file.
 */
export function createSmtpTransport(): Transporter {
  return new NodemailerMailer().rawTransport();
}
