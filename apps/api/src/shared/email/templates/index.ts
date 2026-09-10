import type { NotificationEventType } from "../../../modules/notifications/domain/entities/notification.entity";
import type { EmailMessage } from "../email-message";
import {
  renderPasswordResetSuccessEmail,
  renderWelcomeEmail,
} from "./auth.templates";
import {
  renderOrderCancelledEmail,
  renderOrderConfirmedEmail,
  renderOrderDeliveredEmail,
  renderOrderShippedEmail,
  renderPaymentFailedEmail,
} from "./order.templates";
import {
  renderRefundCompletedEmail,
  renderRefundInitiatedEmail,
  renderReturnApprovedEmail,
  renderReturnRejectedEmail,
  renderReturnRequestedEmail,
} from "./returns.templates";

export type EmailRenderer = (payload: Record<string, unknown>) => Pick<EmailMessage, "subject" | "html" | "text">;

/**
 * Maps every queue-delivered notification event to the branded template
 * that renders it. `NodemailerEmailProvider` looks a renderer up here by
 * `notification.type`. The two OTP renderers are NOT here — the auth
 * module's synchronous notifiers import them directly from
 * `auth.templates.ts`.
 *
 * REFUND_PROCESSED (deprecated, no longer emitted) maps to the
 * refund-completed template so any historical / in-flight row still
 * renders sensibly.
 */
export const EMAIL_TEMPLATES: Record<NotificationEventType, EmailRenderer> = {
  WELCOME: renderWelcomeEmail,
  PASSWORD_RESET_SUCCESS: renderPasswordResetSuccessEmail,
  ORDER_CONFIRMED: renderOrderConfirmedEmail,
  PAYMENT_FAILED: renderPaymentFailedEmail,
  ORDER_SHIPPED: renderOrderShippedEmail,
  ORDER_DELIVERED: renderOrderDeliveredEmail,
  ORDER_CANCELLED: renderOrderCancelledEmail,
  RETURN_REQUESTED: renderReturnRequestedEmail,
  RETURN_APPROVED: renderReturnApprovedEmail,
  RETURN_REJECTED: renderReturnRejectedEmail,
  REFUND_INITIATED: renderRefundInitiatedEmail,
  REFUND_COMPLETED: renderRefundCompletedEmail,
  REFUND_PROCESSED: renderRefundCompletedEmail,
};

export { renderRegistrationOtpEmail, renderPasswordResetOtpEmail } from "./auth.templates";
