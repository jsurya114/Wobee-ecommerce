import { NotFoundError } from "../../../../shared/errors";
import type { AppliedOfferSummary, ProductDetailEntity } from "../../domain/entities/product.entity";
import type { InventoryReaderPort } from "../ports/inventory-reader.port";
import type { OfferReaderPort } from "../ports/offer-reader.port";
import type { PricingReaderPort } from "../ports/pricing-reader.port";
import type { ProductRepositoryPort } from "../ports/product-repository.port";

export interface VariantWithPriceAndStock {
  id: string;
  sku: string;
  color: string;
  size: string;
  weightGrams: number;
  /** The BASE price — before any automatic Offer discount. Kept for a strikethrough display; the actual purchase price is `offerPricePaise`. */
  pricePaise: number;
  /** Null for a FIXED-category product (2026-08-31) — there is no rate/kg. */
  ratePerKgPaise: number | null;
  /** Phase 2 (2026-09-14) — `pricePaise` with the applicable Offer's discount already subtracted. Equal to `pricePaise` when no offer applies. This is the price the purchase UI must actually charge. */
  offerPricePaise: number;
  /** Null when no offer currently applies to this product. */
  offer: AppliedOfferSummary | null;
  availableQuantity: number;
  inStock: boolean;
  /** Free-text product details (redesign O-2) — the PDP "Details" disclosure. */
  fabric: string | null;
  fit: string | null;
  measurements: string | null;
}

export interface ProductDetailResult extends Omit<ProductDetailEntity, "variants"> {
  variants: VariantWithPriceAndStock[];
}

/**
 * Detail page recomputes price live (via pricing) rather than reading
 * effectivePricePaiseCache — a single product's few variants make this
 * cheap, and it's the natural place to exercise the same live-pricing path
 * cart uses (ADR-012's cache is a listing/sort optimization only).
 */
export class GetProductBySlugUseCase {
  constructor(
    private readonly productRepository: ProductRepositoryPort,
    private readonly pricingReader: PricingReaderPort,
    private readonly inventoryReader: InventoryReaderPort,
    private readonly offerReader: OfferReaderPort,
  ) {}

  async execute(slug: string): Promise<ProductDetailResult> {
    const product = await this.productRepository.findBySlug(slug);
    if (!product || product.variants.length === 0) {
      throw new NotFoundError("Product not found");
    }

    const activeVariants = product.variants.filter((v) => v.isActive);
    const [prices, availability] = await Promise.all([
      this.pricingReader.calculateMany(
        activeVariants.map((v) => ({
          pricingMode: product.pricingMode,
          weightGrams: v.weightGrams,
          ratePerKgOverridePaise: v.ratePerKgOverridePaise,
          fixedPricePaise: v.fixedPricePaise,
        })),
      ),
      this.inventoryReader.getAvailableQuantities(activeVariants.map((v) => v.id)),
    ]);

    // Offer resolved AFTER the base price — pipeline is BASE -> OFFER (the
    // spec's own required order). One batched call for every variant on
    // this one product, never per-variant — see
    // ResolveApplicableOffersUseCase's own doc comment on avoiding N+1.
    const offerResults = await this.offerReader.resolveMany(
      activeVariants.map((v, i) => ({ productId: product.id, categoryId: product.category.id, basePricePaise: prices[i]!.pricePaise })),
    );

    const variants: VariantWithPriceAndStock[] = activeVariants.map((v, i) => {
      const price = prices[i]!;
      const offerResult = offerResults[i]!;
      const availableQuantity = availability.get(v.id) ?? 0;
      return {
        id: v.id,
        sku: v.sku,
        color: v.color,
        size: v.size,
        weightGrams: v.weightGrams,
        pricePaise: price.pricePaise,
        ratePerKgPaise: price.ratePerKgPaise,
        offerPricePaise: offerResult.pricePaise,
        offer: offerResult.appliedOffer,
        availableQuantity,
        inStock: availableQuantity > 0,
        fabric: v.fabric,
        fit: v.fit,
        measurements: v.measurements,
      };
    });

    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      brand: product.brand,
      category: product.category,
      pricingMode: product.pricingMode,
      images: product.images,
      variants,
      metaTitle: product.metaTitle,
      metaDescription: product.metaDescription,
    };
  }
}
