import jwt from "jsonwebtoken";
import { env } from "../../../../config/env";

export interface AccessTokenPayload {
  sub: string; // userId
  role: "CUSTOMER" | "ADMIN";
}

/** ADR-018: short-lived access token + rotating refresh token (refresh token carried in an httpOnly secure cookie). */
export class JwtService {
  signAccessToken(payload: AccessTokenPayload): string {
    return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
      expiresIn: env.JWT_ACCESS_TOKEN_TTL as jwt.SignOptions["expiresIn"],
    });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
  }
}
