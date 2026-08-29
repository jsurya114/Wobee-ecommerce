import bcrypt from "bcryptjs";
import { env } from "../../../../config/env";

/** ADR-018 calls for bcrypt; using bcryptjs (pure JS, no native build step) — same algorithm, drop-in API. */
export class BcryptService {
  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, env.BCRYPT_SALT_ROUNDS);
  }

  compare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
