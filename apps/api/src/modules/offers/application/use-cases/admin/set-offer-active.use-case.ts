import type { OfferEntity } from "../../../domain/entities/offer.entity";
import type { OfferRepositoryPort } from "../../ports/offer-repository.port";

/** Manual activate/deactivate — independent of the schedule window (spec: "Admin may still manually deactivate an offer"). */
export class SetOfferActiveUseCase {
  constructor(private readonly offerRepository: OfferRepositoryPort) {}

  execute(id: string, isActive: boolean): Promise<OfferEntity> {
    return this.offerRepository.setActive(id, isActive);
  }
}
