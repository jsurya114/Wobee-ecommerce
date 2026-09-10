import { describe, expect, it, vi } from "vitest";
import { NodemailerEmailProvider } from "./nodemailer-email.provider";
import { NotificationDeliveryError } from "../../domain/errors/notification-delivery.error";
import type { MailerPort } from "../../../../shared/email/mailer.port";
import type { NotificationEntity } from "../../domain/entities/notification.entity";

function notif(overrides: Partial<NotificationEntity> = {}): NotificationEntity {
  return {
    id: "n1",
    userId: "u1",
    type: "ORDER_CONFIRMED",
    channel: "EMAIL",
    payload: { contactEmail: "c@example.com", orderNumber: "O1" },
    status: "SENDING",
    createdAt: new Date(),
    sentAt: null,
    ...overrides,
  };
}

describe("NodemailerEmailProvider", () => {
  it("renders the template for the event type and hands it to the mailer", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const mailer: MailerPort = { send };
    await new NodemailerEmailProvider(mailer).send(notif());

    expect(send).toHaveBeenCalledTimes(1);
    const msg = send.mock.calls[0]![0];
    expect(msg.to).toBe("c@example.com");
    expect(msg.subject).toBe("Order #O1 confirmed");
    expect(msg.html).toContain("<html");
    expect(msg.text.length).toBeGreaterThan(0);
  });

  it("throws a NON-retryable error when contactEmail is missing (worker -> UnrecoverableError)", async () => {
    const mailer: MailerPort = { send: vi.fn() };
    await expect(new NodemailerEmailProvider(mailer).send(notif({ payload: { orderNumber: "O1" } }))).rejects.toMatchObject({
      retryable: false,
    });
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it("throws a NON-retryable error when there is no template for the type", async () => {
    const mailer: MailerPort = { send: vi.fn() };
    await expect(
      new NodemailerEmailProvider(mailer).send(notif({ type: "MYSTERY" as NotificationEntity["type"] })),
    ).rejects.toBeInstanceOf(NotificationDeliveryError);
  });

  it("propagates a mailer failure unchanged (retryable -> BullMQ retry)", async () => {
    const mailer: MailerPort = { send: vi.fn().mockRejectedValue(new Error("SMTP down")) };
    await expect(new NodemailerEmailProvider(mailer).send(notif())).rejects.toThrow("SMTP down");
  });
});
