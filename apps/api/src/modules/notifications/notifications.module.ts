import { Router } from "express";
import { env } from "../../config/env";
import { getMailer } from "../../shared/email/get-mailer";
import { logError } from "../../shared/logger";
import { EnqueueNotificationUseCase, type EnqueueNotificationInput } from "./application/use-cases/enqueue-notification.use-case";
import { RecoverPendingNotificationsUseCase } from "./application/use-cases/recover-pending-notifications.use-case";
import { MarkNotificationFailedUseCase } from "./application/use-cases/mark-notification-failed.use-case";
import { ProcessNotificationJobUseCase } from "./application/use-cases/process-notification-job.use-case";
import { NotificationRepository } from "./infrastructure/repositories/notification.repository";
import { BullMqNotificationQueue } from "./infrastructure/queues/notification.queue";
import { NodemailerEmailProvider } from "./infrastructure/providers/nodemailer-email.provider";
import { StubEmailProvider } from "./infrastructure/providers/stub-email.provider";

/**
 * notifications module — built out Week 2 Day 8 (week2 (1).md §20). Owns
 * (ADR-010): Notification. Leaf module, zero dependencies on any other
 * module (same posture `audit` already documents for itself) — every
 * caller (orders, returns, refunds) defines its own local
 * NotificationEnqueuerPort and adapts it to `enqueueNotificationUseCase`
 * in that module's own composition root, mirroring exactly how
 * AuditLoggerPort already wires to `recordAuditLogUseCase` everywhere.
 *
 * PAYMENT_SUCCESSFUL isn't wired as its own event — see
 * NotificationEventType's own comment for why it's folded into
 * ORDER_CONFIRMED instead of sent as a second, near-simultaneous message.
 *
 * No HTTP surface: week2 (1).md §20's own requirements list (retry,
 * idempotency, failure handling, structured logging, non-blocking) never
 * asks for an admin-facing view onto notifications, so none was added —
 * the `router` below stays empty, mounted only so apps/index.ts's existing
 * `/notifications` path doesn't need touching.
 */
export const router = Router();

const notificationRepository = new NotificationRepository();
const notificationQueue = new BullMqNotificationQueue();
/**
 * Real nodemailer-backed provider once `SMTP_HOST` is configured;
 * `StubEmailProvider` (which no-ops a send but still exercises the
 * persist -> queue -> worker -> mark-sent pipeline) stays the fallback for
 * local dev without SMTP and for the test suite — so the existing ~700
 * tests and the no-SMTP dev flow are unchanged.
 */
const notificationProvider = env.SMTP_HOST ? new NodemailerEmailProvider(getMailer()) : new StubEmailProvider();

export const enqueueNotificationUseCase = new EnqueueNotificationUseCase(notificationRepository, notificationQueue);
/**
 * What every other module should call after its own transaction has committed: same as
 * `enqueueNotificationUseCase` but an enqueue failure is logged, never thrown — the state change
 * is already durable, so a Redis/DB hiccup must not turn into a 500 (or a lost webhook retry).
 * A row that was written but not queued is picked up by RecoverPendingNotificationsUseCase.
 */
export const bestEffortEnqueueNotificationUseCase = {
  async execute(input: EnqueueNotificationInput): Promise<void> {
    try {
      await enqueueNotificationUseCase.execute(input);
    } catch (error) {
      logError("notifications.enqueue_failed", { type: input.type, error });
    }
  },
};
export const recoverPendingNotificationsUseCase = new RecoverPendingNotificationsUseCase(notificationRepository, notificationQueue);
/** Exported for worker.ts's own composition — the one place outside this module that needs either of these. */
export const processNotificationJobUseCase = new ProcessNotificationJobUseCase(notificationRepository, notificationProvider);
export const markNotificationFailedUseCase = new MarkNotificationFailedUseCase(notificationRepository);
