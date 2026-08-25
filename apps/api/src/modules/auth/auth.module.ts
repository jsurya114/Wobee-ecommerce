// Composition root for the auth module — wires repos/services to use-cases
// to routes (ARCHITECTURE.md §3.2). This is the one place that constructs
// concrete infrastructure and hands it to the application layer as its
// port interfaces.
import { GetCurrentUserUseCase } from "./application/use-cases/get-current-user.use-case";
import { LoginUserUseCase } from "./application/use-cases/login-user.use-case";
import { LogoutUserUseCase } from "./application/use-cases/logout-user.use-case";
import { RefreshTokenUseCase } from "./application/use-cases/refresh-token.use-case";
import { RegisterUserUseCase } from "./application/use-cases/register-user.use-case";
import { AuthRepository } from "./infrastructure/repositories/auth.repository";
import { BcryptService } from "./infrastructure/services/bcrypt.service";
import { JwtService } from "./infrastructure/services/jwt.service";
import { RefreshTokenService } from "./infrastructure/services/refresh-token.service";
import { AuthController } from "./interface/http/auth.controller";
import { createAuthRouter } from "./interface/http/auth.routes";

const authRepository = new AuthRepository();
const bcryptService = new BcryptService();
const jwtService = new JwtService();
const refreshTokenService = new RefreshTokenService();

const registerUserUseCase = new RegisterUserUseCase(authRepository, bcryptService, jwtService, refreshTokenService);
const loginUserUseCase = new LoginUserUseCase(authRepository, bcryptService, jwtService, refreshTokenService);
const refreshTokenUseCase = new RefreshTokenUseCase(authRepository, jwtService, refreshTokenService);
const logoutUserUseCase = new LogoutUserUseCase(authRepository, refreshTokenService);
const getCurrentUserUseCase = new GetCurrentUserUseCase(authRepository);

const authController = new AuthController(
  registerUserUseCase,
  loginUserUseCase,
  refreshTokenUseCase,
  logoutUserUseCase,
  getCurrentUserUseCase,
);

export const router = createAuthRouter(authController);
