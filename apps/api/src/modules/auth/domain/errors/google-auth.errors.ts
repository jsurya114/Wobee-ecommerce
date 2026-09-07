import { ConflictError, ForbiddenError, ServiceUnavailableError, UnauthorizedError } from "../../../../shared/errors";

export class GoogleTokenInvalidError extends UnauthorizedError {
  constructor(message = "Invalid or expired Google credential") {
    super(message);
  }
}

export class GoogleEmailUnverifiedError extends ForbiddenError {
  constructor(message = "Your Google account's email address is not verified") {
    super(message);
  }
}

/** Deliberately generic — mirrors RegisterUserUseCase's own duplicate-email ConflictError message/precedent. Thrown instead of silently linking or taking over an existing PASSWORD/OTP account that shares this email; no account is created or modified. */
export class GoogleAccountConflictError extends ConflictError {
  constructor(
    message = "An account with this email already exists. Log in with your password to continue.",
  ) {
    super(message);
  }
}

/** Wired in place of a real verifier when GOOGLE_CLIENT_ID isn't set — see NotConfiguredGoogleVerifier's own doc comment. */
export class GoogleNotConfiguredError extends ServiceUnavailableError {
  constructor(message = "Google sign-in is not configured") {
    super(message);
  }
}
