export class LogoutUserUseCase {
  async execute(_refreshToken: string): Promise<void> {
    // TODO (Day 2): invalidate/rotate-out the refresh token.
    throw new Error("Not implemented — Week 1 Day 2");
  }
}
