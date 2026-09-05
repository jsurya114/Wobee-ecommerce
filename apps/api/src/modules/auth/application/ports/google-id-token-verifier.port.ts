export interface GoogleIdentity {
  /** Google's stable, provider-specific subject identifier — the ONLY thing used to look up or link a Google account. Never the display name; never derived from email alone. */
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

/**
 * application depends on this interface, not on google-auth-library
 * directly (ARCHITECTURE.md §3.1 / ADR-010's dependency-inversion pattern,
 * same shape as every other *Port in this module). The infrastructure
 * layer implements real verification; a NotConfiguredGoogleVerifier
 * implements the same port for when Google isn't configured.
 */
export interface GoogleIdTokenVerifierPort {
  /** Verifies signature, issuer, audience, and expiry of a Google ID token and returns the trusted claims. Throws GoogleTokenInvalidError / GoogleEmailUnverifiedError / GoogleNotConfiguredError — never returns unverified data. */
  verify(idToken: string): Promise<GoogleIdentity>;
}
