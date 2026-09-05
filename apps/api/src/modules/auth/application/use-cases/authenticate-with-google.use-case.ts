import { ForbiddenError } from "../../../../shared/errors";
import type { UserEntity } from "../../domain/entities/user.entity";
import { GoogleAccountConflictError } from "../../domain/errors/google-auth.errors";
import type { JwtService } from "../../infrastructure/services/jwt.service";
import type { RefreshTokenService } from "../../infrastructure/services/refresh-token.service";
import type { AuthRepositoryPort } from "../ports/auth-repository.port";
import type { GoogleIdTokenVerifierPort } from "../ports/google-id-token-verifier.port";
import { issueTokenPair, type TokenPair } from "./issue-token-pair";

export interface AuthenticateWithGoogleResult extends TokenPair {
  user: UserEntity;
  isNewUser: boolean;
}

/**
 * "Continue with Google" login/registration in one endpoint — reuses the
 * exact same session mechanism as password login/registration
 * (issueTokenPair), never a separate session system. Account linking is
 * by Google's stable `sub` claim ONLY (AuthCredential.providerSubject):
 * an existing GOOGLE credential logs its owner in; a brand-new sub whose
 * email has no existing account creates one (no password, no OTP step —
 * the verified Google ID token is itself the proof of email ownership,
 * same trust level this codebase already grants a verified OTP code); a
 * brand-new sub whose email already belongs to a PASSWORD/OTP account is
 * refused rather than silently linked or taken over (GoogleAccountConflictError)
 * — see journal.md's account-linking policy for the reasoning.
 */
export class AuthenticateWithGoogleUseCase {
  constructor(
    private readonly authRepository: AuthRepositoryPort,
    private readonly googleVerifier: GoogleIdTokenVerifierPort,
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  async execute(credential: string): Promise<AuthenticateWithGoogleResult> {
    const identity = await this.googleVerifier.verify(credential);

    const existingByGoogle = await this.authRepository.findUserByGoogleSubject(identity.sub);
    if (existingByGoogle) {
      if (!existingByGoogle.isActive) {
        throw new ForbiddenError("This account has been deactivated");
      }
      const tokens = await issueTokenPair(existingByGoogle, {
        authRepository: this.authRepository,
        jwtService: this.jwtService,
        refreshTokenService: this.refreshTokenService,
      });
      return { user: existingByGoogle, isNewUser: false, ...tokens };
    }

    const existingByEmail = await this.authRepository.findUserByEmail(identity.email);
    if (existingByEmail) {
      throw new GoogleAccountConflictError();
    }

    const user = await this.authRepository.createUserWithGoogle({
      email: identity.email,
      name: identity.name,
      providerSubject: identity.sub,
    });
    const tokens = await issueTokenPair(user, {
      authRepository: this.authRepository,
      jwtService: this.jwtService,
      refreshTokenService: this.refreshTokenService,
    });
    return { user, isNewUser: true, ...tokens };
  }
}
