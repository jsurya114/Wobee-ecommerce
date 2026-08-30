import { UnprocessableEntityError } from "../../../../shared/errors";

/**
 * All OTP failures are a well-formed request that can't be honoured yet —
 * 422 UNPROCESSABLE_ENTITY, same as the checkout weight-minimum rule. They
 * carry a user-facing `message` the web renders inline under the code
 * field (the OTP-step analogue of LoginForm's whole-form error); the web
 * does not need to branch on a per-case code.
 */
export class OtpInvalidError extends UnprocessableEntityError {
  constructor() {
    super("That code is incorrect. Check it and try again.");
  }
}

export class OtpExpiredError extends UnprocessableEntityError {
  constructor() {
    super("That code has expired. Request a new one.");
  }
}

export class OtpMaxAttemptsError extends UnprocessableEntityError {
  constructor() {
    super("Too many attempts. Request a new code.");
  }
}

export class OtpResendCooldownError extends UnprocessableEntityError {
  constructor(public readonly retryAfterSeconds: number) {
    super(`Please wait ${retryAfterSeconds}s before requesting a new code.`);
  }
}
