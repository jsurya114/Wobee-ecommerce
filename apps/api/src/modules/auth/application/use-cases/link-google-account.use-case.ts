import type { AuthRepositoryPort } from "../ports/auth-repository.port";
import type { GoogleIdTokenVerifierPort } from "../ports/google-id-token-verifier.port";

/**
 * Authenticated account-linking: attaches the CALLER's OWN verified Google
 * identity to their existing (already-logged-in) account. This is the
 * "authenticated linking flow" alternative to silently merging accounts by
 * email match — userId always comes from the caller's own verified access
 * token (authGuard), never from the request body. Not yet wired to any
 * frontend UI (no account-settings "link Google" button exists yet) — the
 * endpoint exists so a customer whose Google sign-in hit
 * GoogleAccountConflictError has a secure path to link it later; see
 * journal.md follow-ups.
 */
export class LinkGoogleAccountUseCase {
  constructor(
    private readonly authRepository: AuthRepositoryPort,
    private readonly googleVerifier: GoogleIdTokenVerifierPort,
  ) {}

  async execute(userId: string, credential: string): Promise<void> {
    const identity = await this.googleVerifier.verify(credential);
    await this.authRepository.linkGoogleAccount(userId, identity.sub);
  }
}
