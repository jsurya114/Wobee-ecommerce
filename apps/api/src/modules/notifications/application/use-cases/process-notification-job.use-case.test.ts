import { describe, expect, it, vi } from "vitest";
import { ProcessNotificationJobUseCase } from "./process-notification-job.use-case";
import { NotificationDeliveryError } from "../../domain/errors/notification-delivery.error";
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

describe("ProcessNotificationJobUseCase", () => {
  it("sends and marks the notification SENT", async () => {
    const notification = buildNotification();
    const notificationRepository = { create: vi.fn(), findById: vi.fn().mockResolvedValue(notification), markSent: vi.fn(), markFailed: vi.fn() };
    const notificationProvider = { send: vi.fn().mockResolvedValue(undefined) };
    const useCase = new ProcessNotificationJobUseCase(notificationRepository, notificationProvider);

    await useCase.execute("notif-1");

    expect(notificationProvider.send).toHaveBeenCalledWith(notification);
    expect(notificationRepository.markSent).toHaveBeenCalledWith("notif-1");
  });

  it("is idempotent — a notification that's already SENT is never re-sent", async () => {
    const notification = buildNotification({ status: "SENT" });
    const notificationRepository = { create: vi.fn(), findById: vi.fn().mockResolvedValue(notification), markSent: vi.fn(), markFailed: vi.fn() };
    const notificationProvider = { send: vi.fn() };
    const useCase = new ProcessNotificationJobUseCase(notificationRepository, notificationProvider);

    await useCase.execute("notif-1");

    expect(notificationProvider.send).not.toHaveBeenCalled();
    expect(notificationRepository.markSent).not.toHaveBeenCalled();
  });

  it("is idempotent — a notification that's already terminally FAILED is never re-attempted", async () => {
    const notification = buildNotification({ status: "FAILED" });
    const notificationRepository = { create: vi.fn(), findById: vi.fn().mockResolvedValue(notification), markSent: vi.fn(), markFailed: vi.fn() };
    const notificationProvider = { send: vi.fn() };
    const useCase = new ProcessNotificationJobUseCase(notificationRepository, notificationProvider);

    await useCase.execute("notif-1");

    expect(notificationProvider.send).not.toHaveBeenCalled();
  });

  it("re-throws the provider's error and never marks it failed itself — that's the worker's own job", async () => {
    const notification = buildNotification();
    const notificationRepository = { create: vi.fn(), findById: vi.fn().mockResolvedValue(notification), markSent: vi.fn(), markFailed: vi.fn() };
    const notificationProvider = { send: vi.fn().mockRejectedValue(new NotificationDeliveryError("no contact email", false)) };
    const useCase = new ProcessNotificationJobUseCase(notificationRepository, notificationProvider);

    await expect(useCase.execute("notif-1")).rejects.toThrow(NotificationDeliveryError);
    expect(notificationRepository.markFailed).not.toHaveBeenCalled();
    expect(notificationRepository.markSent).not.toHaveBeenCalled();
  });

  it("404s on an unknown notification id", async () => {
    const notificationRepository = { create: vi.fn(), findById: vi.fn().mockResolvedValue(null), markSent: vi.fn(), markFailed: vi.fn() };
    const notificationProvider = { send: vi.fn() };
    const useCase = new ProcessNotificationJobUseCase(notificationRepository, notificationProvider);

    await expect(useCase.execute("missing")).rejects.toThrow("Notification not found");
  });
});
