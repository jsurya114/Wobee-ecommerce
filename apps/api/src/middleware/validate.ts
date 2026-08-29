import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";
import { ValidationError } from "../shared/errors";

type RequestPart = "body" | "query" | "params";

/**
 * Generic validation middleware factory — uses the SAME Zod schema
 * apps/web's forms validate against client-side (ADR-020, packages/validation).
 * On success, replaces req[part] with the parsed (and coerced/transformed) data.
 */
export function validate(schema: ZodTypeAny, part: RequestPart = "body") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      next(new ValidationError("Request validation failed", result.error.flatten().fieldErrors));
      return;
    }
    req[part] = result.data;
    next();
  };
}
