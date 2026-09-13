import type { NextFunction, Request, Response } from "express";
import { DomainError } from "../shared/errors";
import { logError } from "../shared/logger";

/**
 * Central error-handler — the last middleware mounted in app.ts. Every
 * use-case failure funnels through here so the HTTP mapping lives in
 * exactly one place. No console.log of secrets/PII (DEVELOPMENT_RULES.md #8) —
 * only structured, request-id-correlated fields are logged.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof DomainError) {
    if (err.httpStatus >= 500) {
      logError("domain_error_5xx", { requestId: req.id, code: err.code, message: err.message, path: req.path, statusCode: err.httpStatus });
    }
    res.status(err.httpStatus).json({
      error: {
        code: err.code,
        message: err.message,
        ...("fieldErrors" in err ? { fieldErrors: err.fieldErrors } : {}),
      },
    });
    return;
  }

  const message = err instanceof Error ? err.message : "Unknown error";
  logError("unhandled_error", {
    requestId: req.id,
    message,
    path: req.path,
    statusCode: 500,
    stack: err instanceof Error ? err.stack : undefined,
  });
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
}
