import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../../../../config/env";

/**
 * One place that turns the `SMTP_*` env vars into a nodemailer transport,
 * so every OTP email adapter (registration, password reset, …) is
 * configured identically. Provider-agnostic — point the vars at Gmail (app
 * password), SES SMTP, Mailtrap, Postmark, etc.
 */
export function createSmtpTransport(): Transporter {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE, // true for 465, false for 587/25 (STARTTLS)
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
}
