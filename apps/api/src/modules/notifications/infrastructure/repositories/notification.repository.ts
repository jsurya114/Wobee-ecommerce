import { Prisma, prisma } from "@woobe/database";
import type { NotificationEntity } from "../../domain/entities/notification.entity";
import type { CreateNotificationInput, NotificationRepositoryPort } from "../../application/ports/notification-repository.port";

/** ADR-010: the only file in this module allowed to import @woobe/database. */
export class NotificationRepository implements NotificationRepositoryPort {
  async create(input: CreateNotificationInput): Promise<NotificationEntity> {
    try {
      const notification = await prisma.notification.create({
        data: {
          userId: input.userId,
          type: input.type,
          channel: input.channel,
          payload: input.payload as Prisma.InputJsonValue,
          dedupeKey: input.dedupeKey ?? null,
        },
      });
      return toEntity(notification);
    } catch (error) {
      // Unique violation on dedupeKey: the same logical email was already recorded — hand back that row.
      if (input.dedupeKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await prisma.notification.findUnique({ where: { dedupeKey: input.dedupeKey } });
        if (existing) return toEntity(existing);
      }
      throw error;
    }
  }

  async findPendingOlderThan(olderThan: Date, limit: number): Promise<NotificationEntity[]> {
    const rows = await prisma.notification.findMany({
      where: { status: "PENDING", createdAt: { lt: olderThan } },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
    return rows.map(toEntity);
  }

  async findById(id: string): Promise<NotificationEntity | null> {
    const notification = await prisma.notification.findUnique({ where: { id } });
    return notification ? toEntity(notification) : null;
  }

  async claimForSending(id: string, staleAfterMs: number): Promise<boolean> {
    const staleCutoff = new Date(Date.now() - staleAfterMs);
    const { count } = await prisma.notification.updateMany({
      where: {
        id,
        // Stale = claimed long ago. claimedAt (not createdAt) so a row that waited in the queue
        // is not instantly reclaimable while another worker is mid-send; legacy rows with no
        // claimedAt fall back to createdAt.
        OR: [
          { status: "PENDING" },
          { status: "SENDING", claimedAt: { lt: staleCutoff } },
          { status: "SENDING", claimedAt: null, createdAt: { lt: staleCutoff } },
        ],
      },
      data: { status: "SENDING", claimedAt: new Date() },
    });
    return count === 1;
  }

  async releaseClaim(id: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { id, status: "SENDING" },
      data: { status: "PENDING", claimedAt: null },
    });
  }

  async markSent(id: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { id, status: "SENDING" },
      data: { status: "SENT", sentAt: new Date() },
    });
  }

  async markFailed(id: string, lastError: string): Promise<void> {
    const existing = await prisma.notification.findUnique({ where: { id }, select: { payload: true } });
    if (!existing) return;
    const payload = (existing.payload && typeof existing.payload === "object" ? existing.payload : {}) as Record<string, unknown>;
    // Guarded: only a non-terminal row moves to FAILED — a row that already
    // reached SENT (e.g. a redelivery that succeeded while the worker's
    // failed-handler was still running) must never be flipped to FAILED.
    await prisma.notification.updateMany({
      where: { id, status: { in: ["PENDING", "SENDING"] } },
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
