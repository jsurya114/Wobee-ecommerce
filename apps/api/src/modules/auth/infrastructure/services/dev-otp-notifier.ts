import { env } from "../../../../config/env";
import type { OtpNotifierPort } from "../../application/ports/otp-notifier.port";

/**
 * No real email provider is configured anywhere in this repo yet
 * (DECISIONS_PENDING.md #7). Development stand-in: log the code so a
 * developer can complete the flow (the use-case also returns it as
 * `devCode` outside production, which is how the browser and integration
 * tests read it). Silent in test (avoid noise) and production — a real
 * OtpNotifierPort adapter (SES/SendGrid) must be wired in auth.module.ts
 * before launch; until then a production start() mints a code nobody gets.
 */
export class DevOtpNotifier implements OtpNotifierPort {
  async sendRegistrationOtp({
    email,
    code,
    expiresAt,
  }: {
    email: string;
    code: string;
    expiresAt: Date;
  }): Promise<void> {
    if (env.NODE_ENV === "development") {
      // `console.warn` (not `.info`) is the only dev-log channel the lint
      // config permits until a real structured logger lands — this line is
      // the stand-in for an actual email send, so a warn is apt.
      console.warn(`[otp] registration code for ${email}: ${code} (expires ${expiresAt.toISOString()})`);
    }
  }
}
