import type { PricingReaderPort } from "../../ports/pricing-reader.port";
import type { ProductRepositoryPort } from "../../ports/product-repository.port";

/**
 * Re-prices every WEIGHT_BASED variant's `effectivePricePaiseCache` (and so
 * its product's `minPricePaiseCache`) against the CURRENT global ₹/kg rate —
 * run right after the admin changes that rate (2026-09-30).
 *
 * Why: those two columns are what the storefront listing filters, sorts and
 * shows by (ADR-012) — including "Shop by Budget" (`maxPrice`). They were
 * only recomputed when a variant itself was edited, so after a rate change
 * every weight-priced product kept its old price in the listing while the
 * PDP, cart and checkout (always live) used the new one. A rate increase
 * then let a product that now costs more than a budget still pass that
 * budget's `minPricePaiseCache <= maxPrice` filter.
 *
 * Prices come from the same pricing path every other caller uses
 * (`PricingReaderPort.calculateMany` → CalculateEffectivePriceUseCase), never
 * a second formula. Only variants whose price actually changed are written.
 */
export class RefreshWeightBasedPriceCachesUseCase {
  constructor(
    private readonly productRepository: ProductRepositoryPort,
    private readonly pricingReader: PricingReaderPort,
  ) {}

  /** Returns how many variant prices changed. */
  async execute(): Promise<number> {
    const variants = await this.productRepository.findWeightBasedVariantsForRepricing();
    if (variants.length === 0) return 0;

    const prices = await this.pricingReader.calculateMany(
      variants.map((variant) => ({
        pricingMode: "WEIGHT_BASED" as const,
        weightGrams: variant.weightGrams,
        ratePerKgOverridePaise: variant.ratePerKgOverridePaise,
        fixedPricePaise: null,
      })),
    );

    const updates = variants.flatMap((variant, index) => {
      const pricePaise = prices[index]!.pricePaise;
      return pricePaise === variant.effectivePricePaiseCache ? [] : [{ id: variant.id, productId: variant.productId, effectivePricePaiseCache: pricePaise }];
    });
    await this.productRepository.updateVariantPriceCaches(updates);
    return updates.length;
  }
}
