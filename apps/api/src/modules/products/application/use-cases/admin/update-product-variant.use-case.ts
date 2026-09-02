import type { UpdateVariantInput as UpdateVariantRequest } from "@woobe/validation";
import { NotFoundError, ValidationError } from "../../../../../shared/errors";
import type { AdminProductVariantEntity } from "../../../domain/entities/product.entity";
import type { PricingReaderPort } from "../../ports/pricing-reader.port";
import type { ProductRepositoryPort } from "../../ports/product-repository.port";

/**
 * Recomputes `effectivePricePaiseCache` only when `weightGrams` or
 * (2026-08-31) `fixedPricePaise` is actually part of this edit — those are
 * the only inputs the price derivation reads (CalculateEffectivePriceUseCase
 * — `ratePerKgOverridePaise` is deprecated and no longer part of this
 * derivation at all, see resolve-effective-rate.ts), so re-deriving on every
 * metadata-only edit (fabric/fit/color/etc.) would be wasted work, not a
 * correctness issue either way. Also recomputes `Product.minPricePaiseCache`
 * afterward, same as variant creation.
 */
export class UpdateProductVariantUseCase {
  constructor(
    private readonly productRepository: ProductRepositoryPort,
    private readonly pricingReader: PricingReaderPort,
  ) {}

  async execute(variantId: string, input: UpdateVariantRequest): Promise<AdminProductVariantEntity> {
    const needsRepricing = input.weightGrams !== undefined || input.fixedPricePaise !== undefined;
    let effectivePricePaiseCache: number | undefined;
    let productId: string | undefined;

    if (needsRepricing) {
      const current = await this.productRepository.findVariantForAdmin(variantId);
      if (!current) {
        throw new NotFoundError("Variant not found");
      }
      productId = current.productId;
      const pricingMode = await this.productRepository.findProductPricingMode(productId);
      if (!pricingMode) {
        throw new NotFoundError("Variant not found");
      }

      // weightGrams needed even for a fixedPricePaise-only edit — the
      // existing row is the source of truth for whichever isn't part of
      // this edit. ratePerKgOverridePaise is deliberately NOT read from
      // `current` here (deprecated, ignored — see resolve-effective-rate.ts).
      const weightGrams = input.weightGrams ?? current.weightGrams;
      const fixedPricePaise = input.fixedPricePaise !== undefined ? input.fixedPricePaise : current.fixedPricePaise;

      if (pricingMode === "FIXED" && fixedPricePaise == null) {
        throw new ValidationError("This category is fixed-price — set a price for this variant", {
          fixedPricePaise: ["Required for a fixed-price category"],
        });
      }

      const [price] = await this.pricingReader.calculateMany([{ pricingMode, weightGrams, ratePerKgOverridePaise: null, fixedPricePaise }]);
      effectivePricePaiseCache = price!.pricePaise;
    }

    const updated = await this.productRepository.updateVariant(variantId, { ...input, effectivePricePaiseCache });

    if (productId) {
      await this.productRepository.recomputeMinPrice(productId);
    }

    return updated;
  }
}
