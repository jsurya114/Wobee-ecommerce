import type { NotificationChannel } from "@woobe/types";
import type { NotificationEventType } from "../../domain/entities/notification.entity";
import type { NotificationQueuePort } from "../ports/notification-queue.port";
import type { NotificationRepositoryPort } from "../ports/notification-repository.port";

export interface EnqueueNotificationInput {
  userId: string | null;
  type: NotificationEventType;
  channel: NotificationChannel;
  payload: Record<string, unknown>;
}

/**
 * The one entry point every other module calls (week2 (1).md §20's own
 * "API -> domain event" arrow) — persists first, enqueues second, so a
 * Notification row always exists before any queue/worker activity can
 * reference it. Called AFTER the caller's own transaction commits (same
 * "external side effect only once the real state change is durable"
 * posture as this codebase's existing refund-issuance call sites) —
 * callers never await this inside their own DB transaction.
 */
export class EnqueueNotificationUseCase {
  constructor(
    private readonly notificationRepository: NotificationRepositoryPort,
    private readonly notificationQueue: NotificationQueuePort,
  ) {}

  async execute(input: EnqueueNotificationInput): Promise<void> {
    const notification = await this.notificationRepository.create(input);
    await this.notificationQueue.enqueue(notification.id);
  }
}
