import { createHash, randomBytes } from "node:crypto";

/**
 * The refresh token is an opaque random string, NOT a JWT — the auth
 * repository stores only its sha256 hash (RefreshToken.tokenHash), so a
 * leaked database row can't be turned back into a usable token. The raw
 * token exists only in the httpOnly cookie and this request/response cycle.
 */
export class RefreshTokenService {
  generate(): string {
    return randomBytes(32).toString("hex");
  }

  hash(rawToken: string): string {
    return createHash("sha256").update(rawToken).digest("hex");
  }
}
