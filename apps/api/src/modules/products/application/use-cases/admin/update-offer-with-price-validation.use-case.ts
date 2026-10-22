import type { UpdateOfferInput as UpdateOfferRequest } from "@woobe/validation";
import { ValidationError } from "../../../../../shared/errors";
import type { GetOfferAdminUseCase } from "../../../../offers/application/use-cases/admin/get-offer-admin.use-case";
import type { UpdateOfferUseCase } from "../../../../offers/application/use-cases/admin/update-offer.use-case";
import type { OfferEntity } from "../../../../offers/domain/entities/offer.entity";
import type { ValidateOfferDiscountUseCase } from "./validate-offer-discount.use-case";

/**
 * Update-path counterpart to `CreateOfferWithPriceValidationUseCase` — see
 * its own doc comment and `ValidateOfferDiscountUseCase`'s for why this
 * cross-module guard lives in `products`, not `offers`.
 *
 * Validates against the FINAL, merged shape (existing row + this patch),
 * not just whatever fields happened to be in this one request — same
 * reasoning `UpdateOfferUseCase`'s own doc comment gives for
 * `validateOfferInput`: a patch that only sends `discountValue` must still
 * be checked against the offer's EXISTING scope/target, not skip the check
 * just because they weren't resent. `getOfferAdminUseCase` (offers module,
 * already exported) fetches that existing row — a second, harmless read
 * alongside the one `updateOfferUseCase.execute` itself does internally
 * for the exact same purpose; the row can't change between the two within
 * one request.
 */
export class UpdateOfferWithPriceValidationUseCase {
  constructor(
    private readonly getOfferAdminUseCase: Pick<GetOfferAdminUseCase, "execute">,
    private readonly validateOfferDiscountUseCase: ValidateOfferDiscountUseCase,
    private readonly updateOfferUseCase: Pick<UpdateOfferUseCase, "execute">,
  ) {}

  async execute(id: string, input: UpdateOfferRequest): Promise<OfferEntity> {
    const existing = await this.getOfferAdminUseCase.execute(id);

    const merged = {
      discountType: input.discountType ?? existing.discountType,
      discountValue: input.discountValue ?? existing.discountValue,
      scope: input.scope ?? existing.scope,
      categoryId: input.categoryId !== undefined ? input.categoryId : existing.categoryId,
      productIds: input.productIds !== undefined ? input.productIds : existing.productIds,
    };

    const error = await this.validateOfferDiscountUseCase.execute(merged);
    if (error) {
      throw new ValidationError(error, { discountValue: [error] });
    }
    return this.updateOfferUseCase.execute(id, input);
  }
}
