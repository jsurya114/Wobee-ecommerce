import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../../../../config/env";
import { OTP_TTL_MS } from "../../domain/otp.policy";
import type { OtpNotifierPort } from "../../application/ports/otp-notifier.port";

/**
 * Real OTP email via SMTP (nodemailer). Provider-agnostic — point the
 * SMTP_* env vars at Gmail (app password), SES SMTP, Mailtrap, Postmark, etc.
 * Wired in auth.module.ts only when `env.SMTP_HOST` is set; otherwise
 * `DevOtpNotifier` is used. Implements the same `OtpNotifierPort` as the dev
 * stub, so nothing else in the flow changes.
 */
export class SmtpOtpNotifier implements OtpNotifierPort {
  private readonly transport: Transporter;

  constructor() {
    this.transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE, // true for 465, false for 587/25 (STARTTLS)
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }

  async sendRegistrationOtp({ email, code }: { email: string; code: string; expiresAt: Date }): Promise<void> {
    const minutes = Math.round(OTP_TTL_MS / 60000);
    await this.transport.sendMail({
      from: env.SMTP_FROM,
      to: email,
      subject: `${code} is your Woobe verification code`,
      text: `Your Woobe verification code is ${code}. It expires in ${minutes} minutes. If you didn't request this, you can ignore this email.`,
      html:
        `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#262220">` +
        `<p style="margin:0 0 12px">Your Woobe verification code:</p>` +
        `<p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:0 0 12px">${code}</p>` +
        `<p style="margin:0;color:#786D68;font-size:14px">Expires in ${minutes} minutes. If you didn't request this, ignore this email.</p>` +
        `</div>`,
    });
  }
}
