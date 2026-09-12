/** The auth-lifecycle emails that go through the async notification queue (2026-09-10). OTP emails do NOT — they are synchronous, see OtpNotifierPort. */
export type AuthNotificationEventType = "WELCOME" | "PASSWORD_RESET_SUCCESS";

/**
 * Narrow port for this module's dependency on the leaf `notifications`
 * module — same shape/reasoning as `orders`'/`returns`' own
 * NotificationEnqueuerPort. Adds an `auth -> notifications` edge (acyclic;
 * `notifications` depends on nothing). Called AFTER the auth use-case's own
 * write has committed; a failure here must never fail account creation or
 * the password reset itself.
 */
export interface NotificationEnqueuerPort {
  enqueue(input: {
    userId: string | null;
    type: AuthNotificationEventType;
    channel: "EMAIL" | "SMS" | "PUSH";
    payload: Record<string, unknown>;
  }): Promise<void>;
}
