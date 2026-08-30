import { env } from "../../../../config/env";

/**
 * The generated OTP is echoed back to the client only for local
 * convenience: never in production, and never once a real SMTP sender is
 * configured (`SMTP_HOST` set) — then the code must arrive by email.
 * Integration tests run with no SMTP, so they still read it here.
 */
export function exposeDevCode(code: string): string | undefined {
  return env.NODE_ENV !== "production" && !env.SMTP_HOST ? code : undefined;
}
