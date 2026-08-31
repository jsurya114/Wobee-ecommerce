import type { CreateVariantInput as CreateVariantRequest } from "@woobe/validation";
import { ValidationError } from "../../../../../shared/errors";
import type { AdminProductVariantEntity } from "../../../domain/entities/product.entity";
import type { InventoryInitializerPort } from "../../ports/inventory-initializer.port";
import type { PricingReaderPort } from "../../ports/pricing-reader.port";
import type { ProductRepositoryPort } from "../../ports/product-repository.port";

/**
 * week2 (1).md §16's "Variant management" — weight/rate-override/SKU/
 * size/color/fabric/fit/measurements, plus the two side effects a new
 * variant always needs: `effectivePricePaiseCache` (the listing/sort
 * display cache, ADR-012 — computed live from the same PricingReaderPort
 * every customer-facing price already goes through, never hand-entered)
 * and an Inventory row (every other inventory operation in this codebase
 * assumes exactly one exists per variant — see
 * InitializeInventoryForVariantUseCase's own comment).
 *
 * Takes `productId` as its own parameter, not read from `input` — the
 * wire-level schema (`createVariantSchema`) makes `productId` optional
 * precisely because the HTTP route's URL segment is the authoritative
 * source (see that schema's own comment); this keeps that same authority
 * at the use-case boundary instead of trusting whatever (if anything) a
 * caller put in the body.
 */
export class CreateProductVariantUseCase {
  constructor(
    private readonly productRepository: ProductRepositoryPort,
    private readonly pricingReader: PricingReaderPort,
    private readonly inventoryInitializer: InventoryInitializerPort,
  ) {}

  async execute(productId: string, input: CreateVariantRequest): Promise<AdminProductVariantEntity> {
    const pricingMode = await this.productRepository.findProductPricingMode(productId);
    if (!pricingMode) {
      throw new ValidationError("Product not found");
    }
    if (pricingMode === "FIXED" && input.fixedPricePaise == null) {
      throw new ValidationError("This category is fixed-price — set a price for this variant", {
        fixedPricePaise: ["Required for a fixed-price category"],
      });
    }

    const [price] = await this.pricingReader.calculateMany([
      {
        pricingMode,
        weightGrams: input.weightGrams,
        ratePerKgOverridePaise: input.ratePerKgOverridePaise ?? null,
        fixedPricePaise: input.fixedPricePaise ?? null,
      },
    ]);

    const created = await this.productRepository.createVariant({
      productId,
      sku: input.sku,
      color: input.color,
      size: input.size,
      weightGrams: input.weightGrams,
      ratePerKgOverridePaise: input.ratePerKgOverridePaise,
      fixedPricePaise: input.fixedPricePaise,
      fabric: input.fabric,
      fit: input.fit,
      measurements: input.measurements,
      effectivePricePaiseCache: price!.pricePaise,
    });

    await this.inventoryInitializer.initializeForVariant(created.id, input.initialQuantity ?? 0);
    await this.productRepository.recomputeMinPrice(productId);

    return created;
  }
}
