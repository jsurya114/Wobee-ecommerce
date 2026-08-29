import { UnauthorizedError } from "../../../../shared/errors";

export class InvalidCredentialsError extends UnauthorizedError {
  constructor() {
    super("Invalid email or password");
  }
}
