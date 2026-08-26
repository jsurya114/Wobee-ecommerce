import type { Role } from "@woobe/types";

export interface AuditLogEntity {
  id: string;
  actorId: string;
  actorRole: Role;
  action: string;
  entityType: string;
  entityId: string;
  metadata: unknown;
  createdAt: Date;
}
