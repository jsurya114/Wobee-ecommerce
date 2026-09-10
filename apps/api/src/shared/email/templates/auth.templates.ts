import type { EmailMessage } from "../email-message";
import { esc, renderLayout, renderTextLayout, storefrontUrl } from "./layout";
import { greeting, str } from "./render-helpers";

type Rendered = Pick<EmailMessage, "subject" | "html" | "text">;

/**
 * Registration OTP — used DIRECTLY by the auth module's synchronous
 * `SmtpOtpNotifier` (not through the notifications queue). Reproduces the
 * pre-existing OTP copy, now through the shared branded layout.
 */
export function renderRegistrationOtpEmail(input: { code: string; expiresMinutes: number }): Rendered {
  const { code, expiresMinutes } = input;
  const bodyHtml = `
    <p style="margin:0 0 14px">Enter this code to verify your email and finish creating your Woobe account:</p>
    <p style="margin:0 0 14px;font-size:30px;font-weight:700;letter-spacing:8px;color:#262220">${esc(code)}</p>
    <p style="margin:0;color:#786d68;font-size:13px">Expires in ${esc(expiresMinutes)} minutes. If you didn't request this, you can ignore this email.</p>`;
  return {
    subject: `${code} is your Woobe verification code`,
    html: renderLayout({ heading: "Verify your email", bodyHtml, previewText: `Your code: ${code}` }),
    text: renderTextLayout({
      heading: "Verify your email",
      bodyText: `Enter this code to verify your email and finish creating your Woobe account:\n\n${code}\n\nExpires in ${expiresMinutes} minutes. If you didn't request this, ignore this email.`,
    }),
  };
}

/**
 * Forgot-password OTP — used DIRECTLY by the auth module's synchronous
 * `SmtpPasswordResetNotifier`.
 */
export function renderPasswordResetOtpEmail(input: { code: string; expiresMinutes: number }): Rendered {
  const { code, expiresMinutes } = input;
  const bodyHtml = `
    <p style="margin:0 0 14px">Use this code to reset your Woobe password:</p>
    <p style="margin:0 0 14px;font-size:30px;font-weight:700;letter-spacing:8px;color:#262220">${esc(code)}</p>
    <p style="margin:0;color:#786d68;font-size:13px">Expires in ${esc(expiresMinutes)} minutes. If you didn't request a password reset, ignore this email — your password hasn't changed.</p>`;
  return {
    subject: `${code} is your Woobe password reset code`,
    html: renderLayout({ heading: "Your password reset code", bodyHtml, previewText: `Your code: ${code}` }),
    text: renderTextLayout({
      heading: "Your password reset code",
      bodyText: `Use this code to reset your Woobe password:\n\n${code}\n\nExpires in ${expiresMinutes} minutes. If you didn't request a password reset, ignore this email — your password hasn't changed.`,
    }),
  };
}

/** Welcome / account created — async, via the notification queue. payload: { name? }. */
export function renderWelcomeEmail(payload: Record<string, unknown>): Rendered {
  const name = str(payload.name);
  const cta = { ctaLabel: "Start shopping", ctaHref: storefrontUrl("/") };
  const bodyHtml = `
    <p style="margin:0 0 12px">${esc(greeting(name))}</p>
    <p style="margin:0 0 12px">Welcome to Woobe — your account is ready. We price by weight, so what you see is what you pay: no hidden markups.</p>
    <p style="margin:0">Browse the latest arrivals and best sellers whenever you're ready.</p>`;
  return {
    subject: "Welcome to Woobe",
    html: renderLayout({ heading: "Welcome to Woobe", bodyHtml, previewText: "Your account is ready.", ...cta }),
    text: renderTextLayout({
      heading: "Welcome to Woobe",
      bodyText: `${greeting(name)}\n\nWelcome to Woobe — your account is ready. We price by weight, so what you see is what you pay.`,
      ...cta,
    }),
  };
}

/** Password reset successful — async. Security confirmation, no code, no link with a token. payload: { name? }. */
export function renderPasswordResetSuccessEmail(payload: Record<string, unknown>): Rendered {
  const name = str(payload.name);
  const bodyHtml = `
    <p style="margin:0 0 12px">${esc(greeting(name))}</p>
    <p style="margin:0 0 12px">Your Woobe password was just changed, and you've been signed out of all devices.</p>
    <p style="margin:0">If this wasn't you, contact us right away so we can secure your account.</p>`;
  return {
    subject: "Your Woobe password was changed",
    html: renderLayout({
      heading: "Your password was changed",
      bodyHtml,
      previewText: "Your Woobe password was just changed.",
      ctaLabel: "Sign in",
      ctaHref: storefrontUrl("/login"),
    }),
    text: renderTextLayout({
      heading: "Your password was changed",
      bodyText: `${greeting(name)}\n\nYour Woobe password was just changed, and you've been signed out of all devices. If this wasn't you, contact us right away.`,
      ctaLabel: "Sign in",
      ctaHref: storefrontUrl("/login"),
    }),
  };
}
