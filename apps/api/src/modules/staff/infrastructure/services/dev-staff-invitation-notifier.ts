import { env } from "../../../../config/env";
import type { StaffInvitationNotifierPort } from "../../application/ports/staff-invitation-notifier.port";

/**
 * Development stand-in for the staff-invitation email — mirrors auth's
 * DevPasswordResetNotifier. Logs the code so a developer can complete the
 * flow (the use-case also returns it as `devCode` outside production). A
 * real SmtpStaffInvitationNotifier is wired in staff.module.ts once
 * SMTP_HOST is set.
 */
export class DevStaffInvitationNotifier implements StaffInvitationNotifierPort {
  async sendStaffInvitation({
    email,
    code,
    expiresAt,
  }: {
    email: string;
    name: string;
    code: string;
    expiresAt: Date;
  }): Promise<void> {
    if (env.NODE_ENV === "development") {
      console.warn(`[staff-invitation] activation code for ${email}: ${code} (expires ${expiresAt.toISOString()})`);
    }
  }
}
