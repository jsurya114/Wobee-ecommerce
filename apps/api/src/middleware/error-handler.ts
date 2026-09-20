import type { NextFunction, Request, Response } from "express";
import { DomainError } from "../shared/errors";
import { logError } from "../shared/logger";

const CLIENT_ERROR_MESSAGES: Record<number, string> = {
  400: "Malformed request",
  413: "Request body is too large",
  415: "Unsupported content type",
};

function bodyParserClientStatus(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const { status, expose } = err as { status?: unknown; expose?: unknown };
  return typeof status === "number" && Number.isInteger(status) && status >= 400 && status < 500 && expose === true ? status : undefined;
}

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

  // Client mistakes raised by Express's own body parser (express.json: malformed
  // JSON -> 400, body over the size limit -> 413, unsupported charset/encoding ->
  // 400/415). They arrive as `http-errors` objects — a numeric 4xx `status` with
  // `expose: true` — not as DomainErrors, and used to fall through to the 500 below,
  // so a client posting junk was counted (and alerted on) as a SERVER error. Only
  // that exact shape is honored; the parser's own message is never echoed back.
  const clientStatus = bodyParserClientStatus(err);
  if (clientStatus !== undefined) {
    res.status(clientStatus).json({ error: { code: clientStatus === 413 ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST", message: CLIENT_ERROR_MESSAGES[clientStatus] ?? "Malformed request" } });
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
