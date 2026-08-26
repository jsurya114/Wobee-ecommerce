import type { Role } from "@woobe/types";

export interface AuditLogEntry {
  actorId: string;
  actorRole: Role;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: unknown;
}

/** Narrow port for this module's dependency on the leaf `audit` module (ADR-025) — every order-transition use-case writes through this. */
export interface AuditLoggerPort {
  log(entry: AuditLogEntry, tx?: unknown): Promise<void>;
}
