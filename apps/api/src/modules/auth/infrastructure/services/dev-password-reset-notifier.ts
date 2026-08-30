import { env } from "../../../../config/env";
import type { PasswordResetNotifierPort } from "../../application/ports/password-reset-notifier.port";

/**
 * Development stand-in for the password-reset email — mirrors
 * DevOtpNotifier. Logs the code so a developer can complete the flow (the
 * use-case also returns it as `devCode` outside production, which is how the
 * browser and integration tests read it). Silent in test and production; a
 * real SmtpPasswordResetNotifier is wired in auth.module.ts once SMTP_HOST
 * is set.
 */
export class DevPasswordResetNotifier implements PasswordResetNotifierPort {
  async sendPasswordResetOtp({
    email,
    code,
    expiresAt,
  }: {
    email: string;
    code: string;
    expiresAt: Date;
  }): Promise<void> {
    if (env.NODE_ENV === "development") {
      console.warn(`[otp] password-reset code for ${email}: ${code} (expires ${expiresAt.toISOString()})`);
    }
  }
}
