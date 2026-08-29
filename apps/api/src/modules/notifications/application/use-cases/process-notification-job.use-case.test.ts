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

function buildRepo(notification: NotificationEntity | null, claimResult = true) {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(notification),
    claimForSending: vi.fn().mockResolvedValue(claimResult),
    releaseClaim: vi.fn(),
    markSent: vi.fn(),
    markFailed: vi.fn(),
  };
}

describe("ProcessNotificationJobUseCase", () => {
  it("claims the row, sends, then marks it SENT — in that order", async () => {
    const notification = buildNotification();
    const notificationRepository = buildRepo(notification);
    const notificationProvider = { send: vi.fn().mockResolvedValue(undefined) };
    const useCase = new ProcessNotificationJobUseCase(notificationRepository, notificationProvider);

    await useCase.execute("notif-1");

    expect(notificationRepository.claimForSending).toHaveBeenCalledWith("notif-1");
    expect(notificationProvider.send).toHaveBeenCalledWith(notification);
    expect(notificationRepository.markSent).toHaveBeenCalledWith("notif-1");
    // Claim strictly precedes the provider send — this is the anti-double-send guarantee.
    expect(notificationRepository.claimForSending.mock.invocationCallOrder[0]).toBeLessThan(
      notificationProvider.send.mock.invocationCallOrder[0]!,
    );
    expect(notificationRepository.releaseClaim).not.toHaveBeenCalled();
  });

  it("does not send when the claim is lost — a concurrent worker / redelivery already took it", async () => {
    const notification = buildNotification();
    const notificationRepository = buildRepo(notification, /* claimResult */ false);
    const notificationProvider = { send: vi.fn() };
    const useCase = new ProcessNotificationJobUseCase(notificationRepository, notificationProvider);

    await useCase.execute("notif-1");

    expect(notificationRepository.claimForSending).toHaveBeenCalledWith("notif-1");
    expect(notificationProvider.send).not.toHaveBeenCalled();
    expect(notificationRepository.markSent).not.toHaveBeenCalled();
  });

  it("is idempotent — a notification that's already SENT is never claimed or re-sent", async () => {
    const notificationRepository = buildRepo(buildNotification({ status: "SENT" }));
    const notificationProvider = { send: vi.fn() };
    const useCase = new ProcessNotificationJobUseCase(notificationRepository, notificationProvider);

    await useCase.execute("notif-1");

    expect(notificationRepository.claimForSending).not.toHaveBeenCalled();
    expect(notificationProvider.send).not.toHaveBeenCalled();
    expect(notificationRepository.markSent).not.toHaveBeenCalled();
  });

  it("is idempotent — a notification that's already terminally FAILED is never re-attempted", async () => {
    const notificationRepository = buildRepo(buildNotification({ status: "FAILED" }));
    const notificationProvider = { send: vi.fn() };
    const useCase = new ProcessNotificationJobUseCase(notificationRepository, notificationProvider);

    await useCase.execute("notif-1");

    expect(notificationRepository.claimForSending).not.toHaveBeenCalled();
    expect(notificationProvider.send).not.toHaveBeenCalled();
  });

  it("releases the claim and re-throws on a provider failure — never marks it failed itself (that's the worker's job)", async () => {
    const notificationRepository = buildRepo(buildNotification());
    const notificationProvider = { send: vi.fn().mockRejectedValue(new NotificationDeliveryError("smtp down", true)) };
    const useCase = new ProcessNotificationJobUseCase(notificationRepository, notificationProvider);

    await expect(useCase.execute("notif-1")).rejects.toThrow(NotificationDeliveryError);
    expect(notificationRepository.releaseClaim).toHaveBeenCalledWith("notif-1");
    expect(notificationRepository.markFailed).not.toHaveBeenCalled();
    expect(notificationRepository.markSent).not.toHaveBeenCalled();
  });

  it("404s on an unknown notification id", async () => {
    const notificationRepository = buildRepo(null);
    const notificationProvider = { send: vi.fn() };
    const useCase = new ProcessNotificationJobUseCase(notificationRepository, notificationProvider);

    await expect(useCase.execute("missing")).rejects.toThrow("Notification not found");
  });
});
