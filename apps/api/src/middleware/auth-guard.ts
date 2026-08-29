import type { Role } from "@woobe/types";
import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { UnauthorizedError } from "../shared/errors";

export interface AuthenticatedUser {
  id: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

interface AccessTokenPayload {
  sub: string;
  role: Role;
}

/**
 * Verifies the access token's signature only (deliberately NOT importing
 * the auth module's JwtService — that lives in auth/infrastructure, and
 * this middleware protects routes across every module, not just auth's own.
 * Duplicating a two-line jwt.verify call here is cheaper than reaching
 * across a module boundary for it — see apps/api/.dependency-cruiser.cjs.)
 */
export function authGuard(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next(new UnauthorizedError("Missing access token"));
    return;
  }

  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(new UnauthorizedError("Invalid or expired access token"));
  }
}
