import { Prisma, prisma } from "@woobe/database";
import type { NotificationEntity } from "../../domain/entities/notification.entity";
import type { CreateNotificationInput, NotificationRepositoryPort } from "../../application/ports/notification-repository.port";

/** ADR-010: the only file in this module allowed to import @woobe/database. */
export class NotificationRepository implements NotificationRepositoryPort {
  async create(input: CreateNotificationInput): Promise<NotificationEntity> {
    const notification = await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        channel: input.channel,
        payload: input.payload as Prisma.InputJsonValue,
      },
    });
    return toEntity(notification);
  }

  async findById(id: string): Promise<NotificationEntity | null> {
    const notification = await prisma.notification.findUnique({ where: { id } });
    return notification ? toEntity(notification) : null;
  }

  async markSent(id: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "SENT", sentAt: new Date() },
    });
  }

  async markFailed(id: string, lastError: string): Promise<void> {
    const existing = await prisma.notification.findUnique({ where: { id }, select: { payload: true } });
    if (!existing) return;
    const payload = (existing.payload && typeof existing.payload === "object" ? existing.payload : {}) as Record<string, unknown>;
    await prisma.notification.update({
      where: { id },
      data: { status: "FAILED", payload: { ...payload, lastError } as Prisma.InputJsonValue },
    });
  }
}

function toEntity(notification: {
  id: string;
  userId: string | null;
  type: string;
  channel: string;
  payload: Prisma.JsonValue;
  status: string;
  createdAt: Date;
  sentAt: Date | null;
}): NotificationEntity {
  return {
    id: notification.id,
    userId: notification.userId,
    type: notification.type as NotificationEntity["type"],
    channel: notification.channel as NotificationEntity["channel"],
    payload: (notification.payload && typeof notification.payload === "object" ? notification.payload : {}) as Record<string, unknown>,
    status: notification.status as NotificationEntity["status"],
    createdAt: notification.createdAt,
    sentAt: notification.sentAt,
  };
}
