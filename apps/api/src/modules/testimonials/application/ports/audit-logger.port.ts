import type { Role } from "@woobe/types";

export interface AuditLogEntry {
  actorId: string;
  actorRole: Role;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

/** Same trivial pass-through adapter shape onto `audit`'s recordAuditLogUseCase every other module already uses. */
export interface AuditLoggerPort {
  log(entry: AuditLogEntry): Promise<void>;
}
