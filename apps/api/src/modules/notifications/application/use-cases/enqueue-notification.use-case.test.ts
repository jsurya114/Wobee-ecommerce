import { describe, expect, it, vi } from "vitest";
import { EnqueueNotificationUseCase } from "./enqueue-notification.use-case";
import type { NotificationEntity } from "../../domain/entities/notification.entity";

function buildNotification(overrides: Partial<NotificationEntity> = {}): NotificationEntity {
  return {
    id: "notif-1",
    userId: "user-1",
    type: "ORDER_CONFIRMED",
    channel: "EMAIL",
    payload: { contactEmail: "a@a.com" },
    status: "PENDING",
    createdAt: new Date(),
    sentAt: null,
    ...overrides,
  };
}

describe("EnqueueNotificationUseCase", () => {
  it("persists the notification first, then enqueues its id — never the other way around", async () => {
    const created = buildNotification();
    const calls: string[] = [];
    const notificationRepository = {
      create: vi.fn().mockImplementation(async () => {
        calls.push("create");
        return created;
      }),
      findById: vi.fn(),
      claimForSending: vi.fn(),
      releaseClaim: vi.fn(),
      markSent: vi.fn(),
      markFailed: vi.fn(),
    };
    const notificationQueue = {
      enqueue: vi.fn().mockImplementation(async () => {
        calls.push("enqueue");
      }),
    };
    const useCase = new EnqueueNotificationUseCase(notificationRepository, notificationQueue);

    await useCase.execute({ userId: "user-1", type: "ORDER_CONFIRMED", channel: "EMAIL", payload: { contactEmail: "a@a.com" } });

    expect(calls).toEqual(["create", "enqueue"]);
    expect(notificationQueue.enqueue).toHaveBeenCalledWith(created.id);
  });
});
