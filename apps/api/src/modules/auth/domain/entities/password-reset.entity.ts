/**
 * An in-progress forgot-password reset for an EXISTING account (email-OTP
 * flow). Holds only the OTP bookkeeping plus the id of the user whose
 * password will change; framework/Prisma-free, same as UserEntity and
 * EmailVerificationEntity. Shares every timing/attempt rule with
 * registration via the pure `otp.policy` module.
 */
export interface PasswordResetEntity {
  email: string;
  userId: string;
  codeHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  attempts: number;
  resendCount: number;
  lastSentAt: Date;
}
