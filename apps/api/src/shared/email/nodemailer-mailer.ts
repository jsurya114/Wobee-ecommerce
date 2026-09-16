import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../../config/env";
import type { EmailMessage } from "./email-message";
import type { MailerPort } from "./mailer.port";

/**
 * The ONLY place `nodemailer` is constructed in this codebase. Both email
 * paths — the synchronous auth OTP notifiers and the async
 * `NodemailerEmailProvider` the BullMQ worker runs — go through one shared
 * `MailerPort`, so SMTP is configured identically everywhere and the
 * library never leaks past this file.
 *
 * Provider-agnostic: point the `SMTP_*` env vars at any endpoint (Gmail app
 * password, SES SMTP, Mailtrap, Postmark, …). `SMTP_SECURE` is `true` for
 * port 465, `false` for 587/25 (STARTTLS). Credentials are read from env
 * and never logged.
 *
 * NOTE for deployment: the notification `worker` process (which sends every
 * order/return/refund email) needs the same `SMTP_*` vars as the `server`
 * process. See `.env.example`.
 */
export class NodemailerMailer implements MailerPort {
  private readonly transport: Transporter;
  private readonly from: string;

  constructor(transport?: Transporter) {
    this.transport =
      transport ??
      nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
        // Nodemailer's own defaults (2min/30s/10min) are far too generous for
        // this codebase's two callers: the synchronous registration-OTP path
        // (a real user is waiting on the HTTP response) and the BullMQ
        // notification worker (default concurrency 1 — one hung send blocks
        // every other queued notification behind it for the full timeout).
        // Bounding these to single-digit seconds makes a slow/unresponsive
        // SMTP endpoint fail fast and retry (worker) or surface an error
        // (OTP) instead of hanging the request or stalling the whole queue.
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
      });
    this.from = env.SMTP_FROM;
  }

  async send(message: EmailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }

  /**
   * Escape hatch for the one pre-existing caller that still needs a raw
   * nodemailer `Transporter` (the `staff` module's invitation notifier, via
   * `auth`'s `createSmtpTransport` re-export). Keeps the single
   * `createTransport` call here rather than a second one elsewhere. New
   * code should depend on `MailerPort`, not this.
   */
  rawTransport(): Transporter {
    return this.transport;
  }
}
