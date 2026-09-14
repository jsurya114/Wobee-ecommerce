import type { OfferEntity } from "../../../domain/entities/offer.entity";
import type { OfferRepositoryPort } from "../../ports/offer-repository.port";

export class ListOffersAdminUseCase {
  constructor(private readonly offerRepository: OfferRepositoryPort) {}

  execute(): Promise<OfferEntity[]> {
    return this.offerRepository.findAllForAdmin();
  }
}
