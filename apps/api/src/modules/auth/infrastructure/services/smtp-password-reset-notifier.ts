import type { Transporter } from "nodemailer";
import { env } from "../../../../config/env";
import { OTP_TTL_MS } from "../../domain/otp.policy";
import type { PasswordResetNotifierPort } from "../../application/ports/password-reset-notifier.port";
import { createSmtpTransport } from "./smtp-transport";

/**
 * Real password-reset OTP email via SMTP (nodemailer) — sibling of
 * SmtpOtpNotifier. Wired in auth.module.ts only when `env.SMTP_HOST` is
 * set; otherwise DevPasswordResetNotifier is used. Same OTP-code contract
 * as registration, different copy (a reset the user asked for, not a
 * verify).
 */
export class SmtpPasswordResetNotifier implements PasswordResetNotifierPort {
  private readonly transport: Transporter;

  constructor() {
    this.transport = createSmtpTransport();
  }

  async sendPasswordResetOtp({ email, code }: { email: string; code: string; expiresAt: Date }): Promise<void> {
    const minutes = Math.round(OTP_TTL_MS / 60000);
    await this.transport.sendMail({
      from: env.SMTP_FROM,
      to: email,
      subject: `${code} is your Woobe password reset code`,
      text: `Use ${code} to reset your Woobe password. It expires in ${minutes} minutes. If you didn't request a password reset, you can ignore this email — your password hasn't changed.`,
      html:
        `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#262220">` +
        `<p style="margin:0 0 12px">Use this code to reset your Woobe password:</p>` +
        `<p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:0 0 12px">${code}</p>` +
        `<p style="margin:0;color:#786D68;font-size:14px">Expires in ${minutes} minutes. If you didn't request a password reset, ignore this email — your password hasn't changed.</p>` +
        `</div>`,
    });
  }
}
