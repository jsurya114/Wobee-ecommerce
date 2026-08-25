/**
 * Base of the DomainError hierarchy (ARCHITECTURE.md §3.4). Every module's
 * domain-level failures extend one of these so the central error-handler
 * middleware can map them to a consistent HTTP response without each
 * controller hand-rolling status codes.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  readonly code = "NOT_FOUND";
  readonly httpStatus = 404;
}

export class ValidationError extends DomainError {
  readonly code = "VALIDATION_ERROR";
  readonly httpStatus = 400;

  constructor(
    message: string,
    public readonly fieldErrors?: Record<string, string[] | undefined>,
  ) {
    super(message);
  }
}

export class UnauthorizedError extends DomainError {
  readonly code = "UNAUTHORIZED";
  readonly httpStatus = 401;
}

export class ForbiddenError extends DomainError {
  readonly code = "FORBIDDEN";
  readonly httpStatus = 403;
}

export class ConflictError extends DomainError {
  readonly code = "CONFLICT";
  readonly httpStatus = 409;
}

/** A well-formed request that violates a business rule (ADR-021's checkout weight minimum), distinct from Zod-level shape validation (ValidationError, 400). */
export class UnprocessableEntityError extends DomainError {
  readonly code = "UNPROCESSABLE_ENTITY";
  readonly httpStatus = 422;
}
