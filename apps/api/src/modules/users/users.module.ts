// Composition root for the users module (ARCHITECTURE.md §3.2). Owns
// (ADR-010): Address. Deliberately does NOT own any part of the User table
// itself — auth already owns every User write (registration, name updates)
// per ADR-010's one-writer-per-table spirit, so profile methods here import
// auth's own exported use-cases directly rather than growing a second
// repository onto the same table (same "reuse the other module's exported
// use-case" pattern admin.module.ts already established for staff login).
//
// New module, not a Week 1 placeholder — week2 (1).md §2 adds `users` to
// the module list; architecture.md's original 17-module Week 1 list never
// had one (auth's own §3.3 note: "auth ... has its full ... layering built
// out"; no separate users entry existed to build out from).
//
// Week 2 Day 3 (week2 (1).md §6 — Customer Profile, §7 — Address
// Management).
import { getCurrentUserUseCase, updateUserProfileUseCase } from "../auth/auth.module";
import { CreateAddressUseCase } from "./application/use-cases/create-address.use-case";
import { DeleteAddressUseCase } from "./application/use-cases/delete-address.use-case";
import { ListAddressesUseCase } from "./application/use-cases/list-addresses.use-case";
import { SetDefaultAddressUseCase } from "./application/use-cases/set-default-address.use-case";
import { UpdateAddressUseCase } from "./application/use-cases/update-address.use-case";
import { AddressRepository } from "./infrastructure/repositories/address.repository";
import { UsersController } from "./interface/http/users.controller";
import { createUsersRouter } from "./interface/http/users.routes";

const addressRepository = new AddressRepository();

const listAddressesUseCase = new ListAddressesUseCase(addressRepository);
const createAddressUseCase = new CreateAddressUseCase(addressRepository);
const updateAddressUseCase = new UpdateAddressUseCase(addressRepository);
const deleteAddressUseCase = new DeleteAddressUseCase(addressRepository);
const setDefaultAddressUseCase = new SetDefaultAddressUseCase(addressRepository);

const usersController = new UsersController(
  getCurrentUserUseCase,
  updateUserProfileUseCase,
  listAddressesUseCase,
  createAddressUseCase,
  updateAddressUseCase,
  deleteAddressUseCase,
  setDefaultAddressUseCase,
);

export const router = createUsersRouter(usersController);
