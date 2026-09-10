import { EMAIL_TEMPLATES, type EmailRenderer } from "../../../../shared/email/templates";
import type { MailerPort } from "../../../../shared/email/mailer.port";
import { NotificationDeliveryError } from "../../domain/errors/notification-delivery.error";
import type { NotificationProviderPort } from "../../application/ports/notification-provider.port";
import type { NotificationEntity } from "../../domain/entities/notification.entity";

/**
 * The real `NotificationProviderPort` (replaces `StubEmailProvider` when
 * `SMTP_HOST` is set — see notifications.module.ts). Resolves the branded
 * template for `notification.type`, renders `{ subject, html, text }` from
 * `notification.payload`, and hands it to the shared `MailerPort`
 * (nodemailer). Nodemailer itself is never imported here — this stays
 * behind the `MailerPort` seam, same as the auth OTP path.
 *
 * Failure contract, unchanged from the stub:
 *  - missing `contactEmail` or no template for the type -> non-retryable
 *    `NotificationDeliveryError` (the worker maps this to BullMQ's
 *    `UnrecoverableError` and stops retrying immediately).
 *  - anything the mailer throws (SMTP down, timeout, auth) propagates
 *    unchanged -> BullMQ's own attempts/backoff retries it.
 */
export class NodemailerEmailProvider implements NotificationProviderPort {
  constructor(
    private readonly mailer: MailerPort,
    private readonly templates: Record<string, EmailRenderer> = EMAIL_TEMPLATES,
  ) {}

  async send(notification: NotificationEntity): Promise<void> {
    const contactEmail = notification.payload.contactEmail;
    if (typeof contactEmail !== "string" || contactEmail.trim().length === 0) {
      throw new NotificationDeliveryError(`Notification ${notification.id} has no contactEmail to send to`, false);
    }

    const render = this.templates[notification.type];
    if (!render) {
      throw new NotificationDeliveryError(`No email template for notification type ${notification.type}`, false);
    }

    const { subject, html, text } = render(notification.payload);
    await this.mailer.send({ to: contactEmail.trim(), subject, html, text });
  }
}
