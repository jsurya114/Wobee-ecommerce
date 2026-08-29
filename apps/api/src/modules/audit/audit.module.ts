// Leaf module (ADR-025) — owns AdminAuditLog, imports nothing from any
// other module. No HTTP surface yet; a future "activity log" viewing page
// mounts here without touching any other module.
import { Router } from "express";
import { RecordAuditLogUseCase } from "./application/use-cases/record-audit-log.use-case";
import { AuditLogRepository } from "./infrastructure/repositories/audit-log.repository";

const auditLogRepository = new AuditLogRepository();

/** Exported for cross-module use — every module that performs a staff-facing write imports this directly. */
export const recordAuditLogUseCase = new RecordAuditLogUseCase(auditLogRepository);

export const router = Router();
