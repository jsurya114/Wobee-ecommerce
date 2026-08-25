import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

interface AccessTokenPayload {
  sub: string;
  role: "CUSTOMER" | "ADMIN";
}

/**
 * Like authGuard, but never rejects — sets req.user when a valid access
 * token is present, leaves it undefined otherwise. Cart routes need this:
 * a guest and a logged-in customer hit the same endpoints (ADR-011), and
 * the handler decides guest-cookie-cart vs. user-cart from req.user's
 * presence rather than two parallel route sets.
 */
export function optionalAuthGuard(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next();
    return;
  }

  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
    req.user = { id: payload.sub, role: payload.role };
  } catch {
    // Invalid/expired token on an optional-auth route — proceed as a guest
    // rather than failing the request; the token just doesn't count.
  }
  next();
}
