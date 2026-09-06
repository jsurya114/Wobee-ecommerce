import { env } from "../../../../config/env";

/**
 * Mirrors auth's exposeDevCode (otp-dev-code.ts) exactly — the generated
 * code is echoed back to the client only for local convenience: never in
 * production, never once a real SMTP sender is configured.
 */
export function exposeDevCode(code: string): string | undefined {
  return env.NODE_ENV !== "production" && !env.SMTP_HOST ? code : undefined;
}
