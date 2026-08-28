import { describe, expect, it } from "vitest";
import { StubEmailProvider } from "./stub-email.provider";
import { NotificationDeliveryError } from "../../domain/errors/notification-delivery.error";
import type { NotificationEntity } from "../../domain/entities/notification.entity";

function buildNotification(payload: Record<string, unknown>): NotificationEntity {
  return { id: "notif-1", userId: "user-1", type: "ORDER_CONFIRMED", channel: "EMAIL", payload, status: "PENDING", createdAt: new Date(), sentAt: null };
}

describe("StubEmailProvider", () => {
  it("succeeds when there's a real contactEmail to send to", async () => {
    const provider = new StubEmailProvider();
    await expect(provider.send(buildNotification({ contactEmail: "a@a.com" }))).resolves.toBeUndefined();
  });

  it("throws a non-retryable NotificationDeliveryError when contactEmail is missing", async () => {
    const provider = new StubEmailProvider();
    await expect(provider.send(buildNotification({}))).rejects.toMatchObject({ retryable: false });
  });

  it("throws a non-retryable NotificationDeliveryError when contactEmail is blank", async () => {
    const provider = new StubEmailProvider();
    await expect(provider.send(buildNotification({ contactEmail: "   " }))).rejects.toBeInstanceOf(NotificationDeliveryError);
  });
});
