import type { VerifyOtpInput } from "@woobe/validation";
import { OtpExpiredError, OtpInvalidError, OtpMaxAttemptsError } from "../../domain/errors/otp.errors";
import { hasVerifyAttemptsLeft, isOtpConsumed, isOtpExpired, MAX_VERIFY_ATTEMPTS } from "../../domain/otp.policy";
import type { JwtService } from "../../infrastructure/services/jwt.service";
import type { OtpCodeService } from "../../infrastructure/services/otp-code.service";
import type { RefreshTokenService } from "../../infrastructure/services/refresh-token.service";
import type { AuthRepositoryPort } from "../ports/auth-repository.port";
import { issueTokenPair } from "./issue-token-pair";
import type { RegisterResult } from "./register-user.use-case";

/**
 * Step 2: check the code, then create the account through the EXISTING
 * `createUserWithPassword` + `issueTokenPair` path — the result shape is
 * identical to RegisterUserUseCase's, so the controller/cookie handling
 * matches `register` exactly. The pending row is deleted on success.
 */
export class VerifyRegistrationOtpUseCase {
  constructor(
    private readonly authRepository: AuthRepositoryPort,
    private readonly otpCodeService: OtpCodeService,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
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

    return { user, ...tokens };
  }
}
