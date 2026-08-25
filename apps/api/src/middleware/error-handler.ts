import type { NextFunction, Request, Response } from "express";
import { DomainError } from "../shared/errors";

/**
 * Central error-handler — the last middleware mounted in app.ts. Every
 * use-case failure funnels through here so the HTTP mapping lives in
 * exactly one place. No console.log of secrets/PII (DEVELOPMENT_RULES.md #8) —
 * only structured, request-id-correlated fields are logged.
 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof DomainError) {
    if (err.httpStatus >= 500) {
      console.error(`[${req.id}] ${err.code}:`, err.message);
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
  console.error(`[${req.id}] UNHANDLED_ERROR:`, message, err instanceof Error ? err.stack : "");
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
}
