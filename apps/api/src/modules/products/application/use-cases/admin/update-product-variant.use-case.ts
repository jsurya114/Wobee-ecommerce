import type { UpdateVariantInput as UpdateVariantRequest } from "@woobe/validation";
import { NotFoundError } from "../../../../../shared/errors";
import type { AdminProductVariantEntity } from "../../../domain/entities/product.entity";
import type { PricingReaderPort } from "../../ports/pricing-reader.port";
import type { ProductRepositoryPort } from "../../ports/product-repository.port";

/**
 * Recomputes `effectivePricePaiseCache` only when `weightGrams` or
 * `ratePerKgOverridePaise` is actually part of this edit — those are the
 * only two inputs the price derivation reads (CalculateEffectivePriceUseCase),
 * so re-deriving on every metadata-only edit (fabric/fit/color/etc.) would
 * be wasted work, not a correctness issue either way. Also recomputes
 * `Product.minPricePaiseCache` afterward, same as variant creation.
 */
export class UpdateProductVariantUseCase {
  constructor(
    private readonly productRepository: ProductRepositoryPort,
    private readonly pricingReader: PricingReaderPort,
  ) {}

  async execute(variantId: string, input: UpdateVariantRequest): Promise<AdminProductVariantEntity> {
    const needsRepricing = input.weightGrams !== undefined || input.ratePerKgOverridePaise !== undefined;
    let effectivePricePaiseCache: number | undefined;
    let productId: string | undefined;

    if (needsRepricing) {
      const current = await this.productRepository.findVariantForAdmin(variantId);
      if (!current) {
        throw new NotFoundError("Variant not found");
      }
      productId = current.productId;
      // Both derivation inputs are needed even for a partial edit (e.g.
      // only ratePerKgOverridePaise changing still needs the CURRENT
      // weightGrams to price against) — the existing row is the source of
      // truth for whichever of the two isn't part of this edit.
      const weightGrams = input.weightGrams ?? current.weightGrams;
      const ratePerKgOverridePaise = input.ratePerKgOverridePaise !== undefined ? input.ratePerKgOverridePaise : current.ratePerKgOverridePaise;
      const [price] = await this.pricingReader.calculateMany([{ weightGrams, ratePerKgOverridePaise }]);
      effectivePricePaiseCache = price!.pricePaise;
    }

    const updated = await this.productRepository.updateVariant(variantId, { ...input, effectivePricePaiseCache });

    if (productId) {
      await this.productRepository.recomputeMinPrice(productId);
    }

    return updated;
  }
}
