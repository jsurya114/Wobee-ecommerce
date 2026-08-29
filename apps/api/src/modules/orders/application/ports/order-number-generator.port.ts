/** application depends on this interface, not on Node's `crypto` directly — the infrastructure layer implements it (same pattern as auth's BcryptService/JwtService/RefreshTokenService). */
export interface OrderNumberGeneratorPort {
  generate(): string;
}
