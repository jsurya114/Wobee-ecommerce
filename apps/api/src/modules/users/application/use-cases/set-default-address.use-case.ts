import type { AddressEntity } from "../../domain/entities/address.entity";
import type { AddressRepositoryPort } from "../ports/address-repository.port";

/** week2 (1).md §7's own "Set default address" bullet — the one path that ever flips isDefault outside of address creation. */
export class SetDefaultAddressUseCase {
  constructor(private readonly addressRepository: AddressRepositoryPort) {}

  execute(userId: string, addressId: string): Promise<AddressEntity> {
    return this.addressRepository.setDefault(userId, addressId);
  }
}
