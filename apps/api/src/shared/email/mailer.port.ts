import type { EmailMessage } from "./email-message";

/**
 * The dependency-inversion seam for email delivery (ARCHITECTURE.md §3.1).
 * Nodemailer is imported by exactly one file in the whole codebase
 * (`nodemailer-mailer.ts`); everything else — the auth OTP notifiers on the
 * synchronous request path, the `NodemailerEmailProvider` on the async
 * BullMQ worker path — depends only on this interface.
 *
 * Contract: resolve on successful hand-off to the SMTP server, THROW on
 * failure. The synchronous OTP path relies on the throw to report an SMTP
 * problem to the user immediately; the async worker path relies on it so
 * BullMQ's own attempts/backoff re-tries a transient failure. A caller that
 * wants "best effort, never fail my flow" wraps the call itself (as the
 * post-commit notification enqueuers already do) — it is not this port's
 * job to swallow errors.
 */
export interface MailerPort {
  send(message: EmailMessage): Promise<void>;
}
