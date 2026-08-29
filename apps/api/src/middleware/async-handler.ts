import type { NextFunction, Request, Response } from "express";

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

/**
 * Express 4 does not catch rejected promises from async route handlers —
 * an unhandled rejection there bypasses error-handler.ts entirely instead
 * of producing a 4xx/5xx response. Wrap every async controller method with
 * this so a thrown DomainError (or anything else) reaches the central
 * error handler the same way a synchronous throw would.
 */
export function asyncHandler(handler: AsyncRouteHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };
}
