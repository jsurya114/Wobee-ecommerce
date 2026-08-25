export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

export class RefreshTokenUseCase {
  async execute(_refreshToken: string): Promise<RefreshResult> {
    // TODO (Day 2): verify refresh token, rotate it, issue a new access token.
    throw new Error("Not implemented — Week 1 Day 2");
  }
}
