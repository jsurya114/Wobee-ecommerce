import type { AddressEntity } from "../../domain/entities/address.entity";
import type { AddressFields, AddressRepositoryPort } from "../ports/address-repository.port";

export interface CreateAddressCommand extends AddressFields {
  isDefault: boolean;
}

/**
 * "Enforce one default address where required" (week2 (1).md §7): a
 * customer's very first address is always their default, regardless of what
 * `isDefault` was sent as — there is never a moment where someone has a
 * saved address but no default. Every address after the first respects the
 * caller's own `isDefault` choice (the repository unsets any prior default
 * transactionally when it's set to true).
 */
export class CreateAddressUseCase {
  constructor(private readonly addressRepository: AddressRepositoryPort) {}

  async execute(userId: string, command: CreateAddressCommand): Promise<AddressEntity> {
    const existingCount = await this.addressRepository.countForUser(userId);
    const isDefault = existingCount === 0 ? true : command.isDefault;
    const { isDefault: _ignored, ...fields } = command;
    return this.addressRepository.create(userId, fields, isDefault);
  }
}
