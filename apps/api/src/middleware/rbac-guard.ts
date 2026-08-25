import type { NextFunction, Request, Response } from "express";
import { ForbiddenError, UnauthorizedError } from "../shared/errors";
import type { AuthenticatedUser } from "./auth-guard";

/** Mount after authGuard — requires req.user to already be set. */
export function requireRole(...roles: AuthenticatedUser["role"][]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError("Missing access token"));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new ForbiddenError("You don't have permission to do that"));
      return;
    }
    next();
  };
}
