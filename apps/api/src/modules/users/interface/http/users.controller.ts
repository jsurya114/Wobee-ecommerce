import type { CreateAddressInput, UpdateAddressInput, UpdateProfileInput } from "@woobe/validation";
import type { Request, Response } from "express";
import { ValidationError } from "../../../../shared/errors";
import type { GetCurrentUserUseCase } from "../../../auth/application/use-cases/get-current-user.use-case";
import type { UpdateUserProfileUseCase } from "../../../auth/application/use-cases/update-user-profile.use-case";
import type { CreateAddressUseCase } from "../../application/use-cases/create-address.use-case";
import type { DeleteAddressUseCase } from "../../application/use-cases/delete-address.use-case";
import type { ListAddressesUseCase } from "../../application/use-cases/list-addresses.use-case";
import type { SetDefaultAddressUseCase } from "../../application/use-cases/set-default-address.use-case";
import type { UpdateAddressUseCase } from "../../application/use-cases/update-address.use-case";

/**
 * Thin gateway (week2 (1).md §6–7). Profile methods are pass-throughs onto
 * `auth`'s own exported use-cases (auth owns every `User` write/read,
 * ADR-010) — same "reuse the other module's use-case directly, don't
 * duplicate its logic" pattern `admin.module.ts` already uses for staff
 * login. Address methods own their own use-cases (`Address` is genuinely
 * new territory for this module). Every route is authGuard-mounted
 * (users.routes.ts) — req.user is guaranteed.
 */
export class UsersController {
  constructor(
    private readonly getCurrentUserUseCase: GetCurrentUserUseCase,
    private readonly updateUserProfileUseCase: UpdateUserProfileUseCase,
    private readonly listAddressesUseCase: ListAddressesUseCase,
    private readonly createAddressUseCase: CreateAddressUseCase,
    private readonly updateAddressUseCase: UpdateAddressUseCase,
    private readonly deleteAddressUseCase: DeleteAddressUseCase,
    private readonly setDefaultAddressUseCase: SetDefaultAddressUseCase,
  ) {}

  async getProfile(req: Request, res: Response): Promise<void> {
    const user = await this.getCurrentUserUseCase.execute(req.user!.id);
    res.status(200).json({ user });
  }

  async updateProfile(req: Request, res: Response): Promise<void> {
    const input = req.body as UpdateProfileInput;
    const user = await this.updateUserProfileUseCase.execute(req.user!.id, input.name);
    res.status(200).json({ user });
  }

  async listAddresses(req: Request, res: Response): Promise<void> {
    const addresses = await this.listAddressesUseCase.execute(req.user!.id);
    res.status(200).json({ addresses });
  }

  async createAddress(req: Request, res: Response): Promise<void> {
    const input = req.body as CreateAddressInput;
    const address = await this.createAddressUseCase.execute(req.user!.id, input);
    res.status(201).json({ address });
  }

  async updateAddress(req: Request, res: Response): Promise<void> {
    const input = req.body as UpdateAddressInput;
    const address = await this.updateAddressUseCase.execute(req.user!.id, requireAddressId(req), input);
    res.status(200).json({ address });
  }

  async deleteAddress(req: Request, res: Response): Promise<void> {
    await this.deleteAddressUseCase.execute(req.user!.id, requireAddressId(req));
    res.status(204).send();
  }

  async setDefaultAddress(req: Request, res: Response): Promise<void> {
    const address = await this.setDefaultAddressUseCase.execute(req.user!.id, requireAddressId(req));
    res.status(200).json({ address });
  }
}

function requireAddressId(req: Request): string {
  const id = req.params.id;
  if (!id || typeof id !== "string") {
    throw new ValidationError("Address id is required");
  }
  return id;
}
