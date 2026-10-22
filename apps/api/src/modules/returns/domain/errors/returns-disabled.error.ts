import { DomainError } from "../../../../shared/errors";

/** Returns are feature-flagged off in Settings (AppConfig.returnsEnabled, 2026-09-28) — new return requests are refused with a stable, client-checkable code. */
export class ReturnsDisabledError extends DomainError {
  readonly code = "RETURNS_DISABLED";
  readonly httpStatus = 403;

  constructor() {
    super("Returns are not available");
  }
}
