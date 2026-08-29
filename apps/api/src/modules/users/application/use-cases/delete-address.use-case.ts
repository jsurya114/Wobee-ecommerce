import { selectPromotedDefault } from "../../domain/select-promoted-default";
import type { AddressRepositoryPort } from "../ports/address-repository.port";

/**
 * If the deleted address was the default and others remain, promotes the
 * oldest remaining one — see `selectPromotedDefault`'s own doc comment for
 * why. If the deleted address wasn't the default, nothing else changes.
 */
export class DeleteAddressUseCase {
  constructor(private readonly addressRepository: AddressRepositoryPort) {}

  async execute(userId: string, addressId: string): Promise<void> {
    const target = await this.addressRepository.findByIdForUser(userId, addressId);
    const remaining = await this.addressRepository.deleteAndListRemaining(userId, addressId);

    if (target?.isDefault) {
      const promotedId = selectPromotedDefault(remaining);
      if (promotedId) {
        await this.addressRepository.setDefault(userId, promotedId);
      }
    }
  }
}
