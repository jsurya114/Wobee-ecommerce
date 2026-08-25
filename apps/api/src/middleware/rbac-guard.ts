import type { NextFunction, Request, Response } from "express";
import { roleHasPermission, type Permission } from "../config/permissions";
import { ForbiddenError, UnauthorizedError } from "../shared/errors";

/**
 * Mount after authGuard — requires req.user to already be set. Checks a
 * required permission against the caller's role -> permission mapping
 * (ADR-024, config/permissions.ts) rather than a raw role-string
 * comparison — replaces Day 2's `requireRole` (see PRE_DAY4_PATCH.md #3).
 * Passes if the caller holds ANY of the listed permissions.
 */
export function requirePermission(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError("Missing access token"));
      return;
    }
    if (!permissions.some((permission) => roleHasPermission(req.user!.role, permission))) {
      next(new ForbiddenError("You don't have permission to do that"));
      return;
    }
    next();
  };
}
