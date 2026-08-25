import { Prisma, prisma } from "@woobe/database";
import { WebhookEventAlreadyExistsError } from "../../domain/errors/webhook-event-already-exists.error";
import type {
  WebhookEventRecord,
  WebhookEventRepositoryPort,
} from "../../application/ports/webhook-event-repository.port";

/**
 * ADR-010: one of three files in the payments module allowed to import
 * @woobe/database (with payment.repository.ts and transaction.repository.ts).
 */
export class WebhookEventRepository implements WebhookEventRepositoryPort {
  async findByProviderAndEventId(provider: string, eventId: string): Promise<WebhookEventRecord | null> {
    const row = await prisma.webhookEvent.findUnique({ where: { provider_eventId: { provider, eventId } } });
    return row ? toRecord(row) : null;
  }

  async create(provider: string, eventId: string, eventType: string, payload: unknown): Promise<WebhookEventRecord> {
    try {
      const row = await prisma.webhookEvent.create({
        data: { provider, eventId, eventType, payload: payload as Prisma.InputJsonValue },
      });
      return toRecord(row);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        (error.meta?.target as string[] | undefined)?.some((f) => f.includes("provider") || f.includes("eventId"))
      ) {
        throw new WebhookEventAlreadyExistsError();
      }
      throw error;
    }
  }

  async markProcessed(id: string): Promise<void> {
    await prisma.webhookEvent.update({ where: { id }, data: { processedAt: new Date() } });
  }
}

function toRecord(row: { id: string; provider: string; eventId: string; processedAt: Date | null }): WebhookEventRecord {
  return { id: row.id, provider: row.provider, eventId: row.eventId, processedAt: row.processedAt };
}
