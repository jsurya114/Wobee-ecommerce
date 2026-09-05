import { GoogleNotConfiguredError } from "../../domain/errors/google-auth.errors";
import type { GoogleIdTokenVerifierPort } from "../../application/ports/google-id-token-verifier.port";

/** Wired in place of GoogleIdTokenVerifierService when GOOGLE_CLIENT_ID isn't set — fails the /auth/google route safely (503) instead of skipping verification or crashing the whole process at boot (dev/test can run with Google unconfigured; every other auth route is unaffected). */
export class NotConfiguredGoogleVerifier implements GoogleIdTokenVerifierPort {
  async verify(): Promise<never> {
    throw new GoogleNotConfiguredError();
  }
}
