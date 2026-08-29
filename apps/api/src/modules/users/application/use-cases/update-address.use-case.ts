import type { AddressEntity } from "../../domain/entities/address.entity";
import type { AddressFields, AddressRepositoryPort } from "../ports/address-repository.port";

/** Authorization: the repository's update() scopes by (id, userId) together — see AddressRepository's own doc comment. */
export class UpdateAddressUseCase {
  constructor(private readonly addressRepository: AddressRepositoryPort) {}

  execute(userId: string, addressId: string, fields: Partial<AddressFields>): Promise<AddressEntity> {
    return this.addressRepository.update(userId, addressId, fields);
  }
}
