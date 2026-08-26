import { Prisma, prisma } from "@woobe/database";
import type { AuditLogRepositoryPort, CreateAuditLogInput } from "../../application/ports/audit-log-repository.port";

type PrismaTx = Prisma.TransactionClient;

/** ADR-010: the only file in the audit module allowed to import @woobe/database. */
export class AuditLogRepository implements AuditLogRepositoryPort {
  async create(input: CreateAuditLogInput, tx?: unknown): Promise<void> {
    const client = (tx as PrismaTx | undefined) ?? prisma;
    await client.adminAuditLog.create({
      data: {
        actorId: input.actorId,
        actorRole: input.actorRole,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
