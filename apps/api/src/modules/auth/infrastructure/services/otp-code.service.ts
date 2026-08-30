import { createHash, randomInt } from "node:crypto";
import { OTP_LENGTH } from "../../domain/otp.policy";

/**
 * The registration OTP mirrors RefreshTokenService: the raw code is never
 * persisted — only its sha256 hex digest is stored (EmailVerification.codeHash).
 * `randomInt` is a CSPRNG; padStart keeps leading-zero codes 6 digits wide.
 */
export class OtpCodeService {
  generateNumericCode(length: number = OTP_LENGTH): string {
    return String(randomInt(0, 10 ** length)).padStart(length, "0");
  }

  hash(rawCode: string): string {
    return createHash("sha256").update(rawCode).digest("hex");
  }
}
