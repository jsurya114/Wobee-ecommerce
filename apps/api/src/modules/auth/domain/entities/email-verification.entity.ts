/**
 * A pending, not-yet-verified customer registration (email-OTP flow). Holds
 * the registration payload captured at "start" plus the OTP bookkeeping;
 * framework/Prisma-free, same as UserEntity.
 */
export interface EmailVerificationEntity {
  email: string;
  codeHash: string;
  name: string;
  phone: string | null;
  passwordHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  attempts: number;
  resendCount: number;
  lastSentAt: Date;
}
