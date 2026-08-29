import type { CreateAuditLogInput, AuditLogRepositoryPort } from "../ports/audit-log-repository.port";

/**
 * Leaf module (zero dependencies on any other module) so every other
 * module can import this directly without ever creating an import cycle
 * (ADR-025). Called both inside a caller's own DB transaction (atomic with
 * a status change) and standalone (e.g. after an external refund call
 * completes) — `tx` is optional for exactly that reason.
 */
export class RecordAuditLogUseCase {
  constructor(private readonly repository: AuditLogRepositoryPort) {}

  execute(input: CreateAuditLogInput, tx?: unknown): Promise<void> {
    return this.repository.create(input, tx);
  }
}
