import { OAuth2Client } from "google-auth-library";
import { GoogleEmailUnverifiedError, GoogleTokenInvalidError } from "../../domain/errors/google-auth.errors";
import type { GoogleIdentity, GoogleIdTokenVerifierPort } from "../../application/ports/google-id-token-verifier.port";

/**
 * Real Google ID-token verification via google-auth-library (Google's own
 * maintained library) — verifyIdToken checks signature, issuer
 * (accounts.google.com / https://accounts.google.com), audience (must
 * match this Client ID), and expiry internally; none of that is
 * reimplemented here. The frontend only ever hands the backend this raw
 * signed JWT — email/name/picture are read from the verified payload
 * after verification, never trusted from any client-supplied field.
 */
export class GoogleIdTokenVerifierService implements GoogleIdTokenVerifierPort {
  private readonly client: OAuth2Client;

  constructor(private readonly clientId: string) {
    this.client = new OAuth2Client(clientId);
  }

  async verify(idToken: string): Promise<GoogleIdentity> {
    let payload;
    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience: this.clientId });
      payload = ticket.getPayload();
    } catch {
      throw new GoogleTokenInvalidError();
    }
    if (!payload?.sub || !payload.email) {
      throw new GoogleTokenInvalidError();
    }
    if (!payload.email_verified) {
      throw new GoogleEmailUnverifiedError();
    }
    return {
      sub: payload.sub,
      email: payload.email.trim().toLowerCase(),
      emailVerified: true,
      name: payload.name?.trim() || payload.email.split("@")[0]!,
    };
  }
}
