import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

/** Assigns a request id (from an inbound X-Request-Id header if present, otherwise generated) for log correlation. */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  req.id = (req.headers["x-request-id"] as string | undefined) ?? randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
}
