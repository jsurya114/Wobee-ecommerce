import { NotFoundError } from "../../../../../shared/errors";
import type { OfferEntity } from "../../../domain/entities/offer.entity";
import type { OfferRepositoryPort } from "../../ports/offer-repository.port";

export class GetOfferAdminUseCase {
  constructor(private readonly offerRepository: OfferRepositoryPort) {}

  async execute(id: string): Promise<OfferEntity> {
    const offer = await this.offerRepository.findByIdForAdmin(id);
    if (!offer) {
      throw new NotFoundError("Offer not found");
    }
    return offer;
  }
}
