import type { Role } from "@woobe/types";

export interface AuditLogEntry {
  actorId: string;
  actorRole: Role;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: unknown;
}

/** Narrow port for this module's dependency on the leaf `audit` module (ADR-025) — every admin return-transition use-case writes through this, same pattern orders' own AuditLoggerPort establishes. */
export interface AuditLoggerPort {
  log(entry: AuditLogEntry): Promise<void>;
}
