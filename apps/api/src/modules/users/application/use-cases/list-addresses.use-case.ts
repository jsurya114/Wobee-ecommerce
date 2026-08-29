import type { AddressEntity } from "../../domain/entities/address.entity";
import type { AddressRepositoryPort } from "../ports/address-repository.port";

export class ListAddressesUseCase {
  constructor(private readonly addressRepository: AddressRepositoryPort) {}

  execute(userId: string): Promise<AddressEntity[]> {
    return this.addressRepository.findAllForUser(userId);
  }
}
