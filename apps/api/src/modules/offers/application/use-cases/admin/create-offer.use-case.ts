import type { CreateOfferInput as CreateOfferRequest } from "@woobe/validation";
import { ValidationError } from "../../../../../shared/errors";
import { validateOfferInput } from "../../../domain/validate-offer-input";
import type { OfferEntity } from "../../../domain/entities/offer.entity";
import type { CreateOfferData, OfferRepositoryPort } from "../../ports/offer-repository.port";

export class CreateOfferUseCase {
  constructor(private readonly offerRepository: OfferRepositoryPort) {}

  async execute(input: CreateOfferRequest): Promise<OfferEntity> {
    const data: CreateOfferData = {
      name: input.name,
      description: input.description ?? null,
      discountType: input.discountType,
      discountValue: input.discountValue,
      scope: input.scope,
      categoryId: input.categoryId ?? null,
      productIds: input.productIds ?? [],
      priority: input.priority ?? 0,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    };

    const error = validateOfferInput(data);
    if (error) {
      throw new ValidationError(error);
    }

    return this.offerRepository.createOffer(data);
  }
}
