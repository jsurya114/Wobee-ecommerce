import type { CreateOfferInput as CreateOfferRequest } from "@woobe/validation";
import { ValidationError } from "../../../../../shared/errors";
import type { CreateOfferUseCase } from "../../../../offers/application/use-cases/admin/create-offer.use-case";
import type { OfferEntity } from "../../../../offers/domain/entities/offer.entity";
import type { ValidateOfferDiscountUseCase } from "./validate-offer-discount.use-case";

/**
 * Thin cross-module guard in front of offers' own `CreateOfferUseCase`
 * (fix: admin offer discount validation) — see
 * `ValidateOfferDiscountUseCase`'s own doc comment for why the check itself
 * lives here, in `products`, rather than inside `offers`' use-case. This
 * class persists nothing itself: on a valid discount it's a pure
 * pass-through to the exact same `createOfferUseCase` `offers.module.ts`
 * already exports (`validateOfferInput`'s own structural checks still run
 * there, unchanged). `admin.module.ts` wires THIS use-case into
 * `AdminOffersController` instead of the raw one — see its own comment.
 */
export class CreateOfferWithPriceValidationUseCase {
  constructor(
    private readonly validateOfferDiscountUseCase: ValidateOfferDiscountUseCase,
    private readonly createOfferUseCase: Pick<CreateOfferUseCase, "execute">,
  ) {}

  async execute(input: CreateOfferRequest): Promise<OfferEntity> {
    const error = await this.validateOfferDiscountUseCase.execute({
      discountType: input.discountType,
      discountValue: input.discountValue,
      scope: input.scope,
      categoryId: input.categoryId ?? null,
      productIds: input.productIds ?? [],
    });
    if (error) {
      throw new ValidationError(error, { discountValue: [error] });
    }
    return this.createOfferUseCase.execute(input);
  }
}
