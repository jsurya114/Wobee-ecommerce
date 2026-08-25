import type { Request, Response } from "express";

/**
 * TODO (Day 2): wire each handler to its use-case (RegisterUserUseCase,
 * LoginUserUseCase, RefreshTokenUseCase, LogoutUserUseCase) via auth.module.ts's
 * composition root, map results to responses (set the refresh token as an
 * httpOnly secure cookie, return the access token in the body).
 * Controllers stay thin — parse request, call use-case, map result.
 */
export class AuthController {
  async register(_req: Request, res: Response): Promise<void> {
    res.status(501).json({ error: { code: "NOT_IMPLEMENTED", message: "auth.register lands Week 1 Day 2" } });
  }

  async login(_req: Request, res: Response): Promise<void> {
    res.status(501).json({ error: { code: "NOT_IMPLEMENTED", message: "auth.login lands Week 1 Day 2" } });
  }

  async refresh(_req: Request, res: Response): Promise<void> {
    res.status(501).json({ error: { code: "NOT_IMPLEMENTED", message: "auth.refresh lands Week 1 Day 2" } });
  }

  async logout(_req: Request, res: Response): Promise<void> {
    res.status(501).json({ error: { code: "NOT_IMPLEMENTED", message: "auth.logout lands Week 1 Day 2" } });
  }
}
