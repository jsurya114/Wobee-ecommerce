import { env } from "../../config/env";
import { DevMailer } from "./dev-mailer";
import type { MailerPort } from "./mailer.port";
import { NodemailerMailer } from "./nodemailer-mailer";

/**
 * Picks the concrete `MailerPort` the same way `auth.module.ts` already
 * picks its OTP notifier: a real `NodemailerMailer` when `SMTP_HOST` is
 * set, a no-op `DevMailer` otherwise. Composition roots call this; tests
 * inject a fake `MailerPort` directly instead.
 */
export function getMailer(): MailerPort {
  return env.SMTP_HOST ? new NodemailerMailer() : new DevMailer();
}

/**
 * Process-wide shared instance — one transport per process (server, and
 * separately the worker). Constructed lazily on first import of this
 * module, which is always after `env` has parsed.
 */
export const mailer: MailerPort = getMailer();
