import { NotificationDeliveryError } from "../../domain/errors/notification-delivery.error";
import type { NotificationProviderPort } from "../../application/ports/notification-provider.port";
import type { NotificationEntity } from "../../domain/entities/notification.entity";

/**
 * No email/SMS/WhatsApp provider is configured anywhere in this repo (no
 * credentials in env.ts/.env.example, confirmed before writing this) —
 * DECISIONS_PENDING.md #7 records this as a placeholder for a real
 * provider (SendGrid/SES/Twilio/etc.) once one is approved and
 * credentialed, same posture RazorpayRefundService already takes for
 * "unconfigured keys" (a clear typed failure, not a silent no-op).
 *
 * Unlike Razorpay's stub (which always fails, since that gateway call has
 * no meaningful "success" without real keys), this one succeeds whenever
 * there's a real contactEmail to send to — the point of this module is to
 * prove out the full pipeline (persist -> queue -> worker -> mark
 * sent/failed, with real retry/idempotency), not to gate that proof behind
 * credentials nobody has approved yet. A genuinely missing contactEmail is
 * the one case this can legitimately, permanently fail on — not a stand-in
 * for "provider unavailable," but a real validation failure worth
 * exercising the non-retryable path with.
 */
export class StubEmailProvider implements NotificationProviderPort {
  async send(notification: NotificationEntity): Promise<void> {
    const contactEmail = notification.payload.contactEmail;
    if (typeof contactEmail !== "string" || contactEmail.trim().length === 0) {
      throw new NotificationDeliveryError(`Notification ${notification.id} has no contactEmail to send to`, false);
    }
    // No real provider call here — see the class comment. Reaching this point with a real
    // contactEmail is treated as delivered.
  }
}
