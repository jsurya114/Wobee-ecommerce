import type { Role } from "@woobe/types";

export interface CreateAuditLogInput {
  actorId: string;
  actorRole: Role;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: unknown;
}

export interface AuditLogRepositoryPort {
  create(input: CreateAuditLogInput, tx?: unknown): Promise<void>;
}
