import type { VerifyOtpInput } from "@woobe/validation";
import { OtpExpiredError, OtpInvalidError, OtpMaxAttemptsError } from "../../domain/errors/otp.errors";
import { hasVerifyAttemptsLeft, isOtpConsumed, isOtpExpired, MAX_VERIFY_ATTEMPTS } from "../../domain/otp.policy";
import type { JwtService } from "../../infrastructure/services/jwt.service";
import type { OtpCodeService } from "../../infrastructure/services/otp-code.service";
import type { RefreshTokenService } from "../../infrastructure/services/refresh-token.service";
import type { AuthRepositoryPort } from "../ports/auth-repository.port";
import type { NotificationEnqueuerPort } from "../ports/notification-enqueuer.port";
import { issueTokenPair } from "./issue-token-pair";
import type { RegisterResult } from "./register-user.use-case";

/**
 * Step 2: check the code, then create the account through the EXISTING
 * `createUserWithPassword` + `issueTokenPair` path — the result shape is
 * identical to RegisterUserUseCase's, so the controller/cookie handling
 * matches `register` exactly. The pending row is deleted on success.
 *
 * On a genuinely-new account it enqueues a WELCOME email (async, via the
 * notification queue) — strictly AFTER the user row exists, and wrapped so
 * a queue failure can never fail the registration the customer just
 * completed.
 */
export class VerifyRegistrationOtpUseCase {
  constructor(
    private readonly authRepository: AuthRepositoryPort,
    private readonly otpCodeService: OtpCodeService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly notificationEnqueuer: NotificationEnqueuerPort,
  ) {}

  async execute({ email, code }: VerifyOtpInput): Promise<RegisterResult> {
    const record = await this.authRepository.findEmailVerificationByEmail(email);
    // No pending registration — don't reveal whether a "start" ever happened.
    if (!record || isOtpConsumed(record)) {
      throw new OtpInvalidError();
    }
    if (isOtpExpired(record, new Date())) {
      throw new OtpExpiredError();
    }
    if (!hasVerifyAttemptsLeft(record)) {
      throw new OtpMaxAttemptsError();
    }

    if (this.otpCodeService.hash(code) !== record.codeHash) {
      await this.authRepository.incrementEmailVerificationAttempts(email);
      throw record.attempts + 1 >= MAX_VERIFY_ATTEMPTS ? new OtpMaxAttemptsError() : new OtpInvalidError();
    }

    // Correct code — reuse the exact account-creation path. P2002 (email
    // taken between start and verify) surfaces as ConflictError, same as today.
    const user = await this.authRepository.createUserWithPassword({
      email: record.email,
      name: record.name,
      phone: record.phone ?? undefined,
      passwordHash: record.passwordHash,
    });
    await this.authRepository.deleteEmailVerification(email);

    const tokens = await issueTokenPair(user, {
      authRepository: this.authRepository,
      jwtService: this.jwtService,
      refreshTokenService: this.refreshTokenService,
    });

    // Best-effort welcome email — the account already exists and is
    // usable; a queue/Redis hiccup here must not turn a successful
    // registration into an error for the customer.
    await this.notificationEnqueuer
      .enqueue({
        userId: user.id,
        type: "WELCOME",
        channel: "EMAIL",
        payload: { contactEmail: user.email, name: user.name },
      })
      .catch(() => undefined);

    return { user, ...tokens };
  }
}
