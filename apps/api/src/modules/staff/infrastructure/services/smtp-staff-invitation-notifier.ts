import type { Transporter } from "nodemailer";
import { createSmtpTransport } from "../../../auth/auth.module";
import { env } from "../../../../config/env";
import { STAFF_INVITATION_TTL_MS } from "../../domain/staff-invitation.policy";
import type { StaffInvitationNotifierPort } from "../../application/ports/staff-invitation-notifier.port";

/**
 * Real staff-invitation email via SMTP (nodemailer) — reuses auth's
 * `createSmtpTransport()` (same SMTP_* env vars every other transactional
 * email in this codebase uses) rather than standing up a second transport.
 * Wired in staff.module.ts only when `env.SMTP_HOST` is set; otherwise
 * DevStaffInvitationNotifier is used, same fallback rule every other
 * notifier here follows.
 */
export class SmtpStaffInvitationNotifier implements StaffInvitationNotifierPort {
  private readonly transport: Transporter;

  constructor() {
    this.transport = createSmtpTransport();
  }

  async sendStaffInvitation({ email, name, code }: { email: string; name: string; code: string; expiresAt: Date }): Promise<void> {
    const hours = Math.round(STAFF_INVITATION_TTL_MS / (60 * 60 * 1000));
    await this.transport.sendMail({
      from: env.SMTP_FROM,
      to: email,
      subject: `${code} is your Woobe staff activation code`,
      text: `Hi ${name}, you've been invited to join Woobe's admin team. Use ${code} to activate your account and set your password. It expires in ${hours} hours. If you weren't expecting this, you can ignore this email.`,
      html:
        `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#262220">` +
        `<p style="margin:0 0 12px">Hi ${name}, you've been invited to join Woobe's admin team.</p>` +
        `<p style="margin:0 0 12px">Use this code to activate your account and set your password:</p>` +
        `<p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:0 0 12px">${code}</p>` +
        `<p style="margin:0;color:#786D68;font-size:14px">Expires in ${hours} hours. If you weren't expecting this, you can ignore this email.</p>` +
        `</div>`,
    });
  }
}
