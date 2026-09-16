import type { UpdateOfferInput as UpdateOfferRequest } from "@woobe/validation";
import { NotFoundError, ValidationError } from "../../../../../shared/errors";
import { validateOfferInput } from "../../../domain/validate-offer-input";
import type { OfferEntity } from "../../../domain/entities/offer.entity";
import type { OfferRepositoryPort, UpdateOfferData } from "../../ports/offer-repository.port";

/**
 * Validates against the FINAL, merged shape (existing row + this patch),
 * not just whatever fields happened to be in this one request — mirrors
 * UpdateCouponUseCase's own doc comment: a patch that only sends
 * `discountValue` must still be checked against the offer's EXISTING
 * `discountType` (a value of 150 is fine for FIXED_AMOUNT, invalid for
 * PERCENTAGE), not skip that rule just because discountType wasn't resent.
 * Same reasoning for scope/categoryId/productIds — changing scope without
 * also resending the new target (or vice versa) is validated against what
 * the row will actually look like after this patch, not each field in
 * isolation.
 */
export class UpdateOfferUseCase {
  constructor(private readonly offerRepository: OfferRepositoryPort) {}

  async execute(id: string, input: UpdateOfferRequest): Promise<OfferEntity> {
    const existing = await this.offerRepository.findByIdForAdmin(id);
    if (!existing) {
      throw new NotFoundError("Offer not found");
    }

    const patch: UpdateOfferData = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.discountType !== undefined ? { discountType: input.discountType } : {}),
      ...(input.discountValue !== undefined ? { discountValue: input.discountValue } : {}),
      ...(input.scope !== undefined ? { scope: input.scope } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.productIds !== undefined ? { productIds: input.productIds } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
      ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
    };

    const merged = {
      discountType: patch.discountType ?? existing.discountType,
      discountValue: patch.discountValue ?? existing.discountValue,
      scope: patch.scope ?? existing.scope,
      categoryId: "categoryId" in patch ? patch.categoryId! : existing.categoryId,
      productIds: "productIds" in patch ? patch.productIds! : existing.productIds,
      startsAt: patch.startsAt ?? existing.startsAt,
      endsAt: patch.endsAt ?? existing.endsAt,
    };

    const error = validateOfferInput(merged);
    if (error) {
      throw new ValidationError(error);
    }

    return this.offerRepository.updateOffer(id, patch);
  }
}
