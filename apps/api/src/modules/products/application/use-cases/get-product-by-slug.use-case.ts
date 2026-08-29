import { NotFoundError } from "../../../../shared/errors";
import type { ProductDetailEntity } from "../../domain/entities/product.entity";
import type { InventoryReaderPort } from "../ports/inventory-reader.port";
import type { PricingReaderPort } from "../ports/pricing-reader.port";
import type { ProductRepositoryPort } from "../ports/product-repository.port";

export interface VariantWithPriceAndStock {
  id: string;
  sku: string;
  color: string;
  size: string;
  weightGrams: number;
  pricePaise: number;
  ratePerKgPaise: number;
  availableQuantity: number;
  inStock: boolean;
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
  ) {}

  async execute(slug: string): Promise<ProductDetailResult> {
    const product = await this.productRepository.findBySlug(slug);
    if (!product || product.variants.length === 0) {
      throw new NotFoundError("Product not found");
    }

    const activeVariants = product.variants.filter((v) => v.isActive);
    const [prices, availability] = await Promise.all([
      this.pricingReader.calculateMany(
        activeVariants.map((v) => ({ weightGrams: v.weightGrams, ratePerKgOverridePaise: v.ratePerKgOverridePaise })),
      ),
      this.inventoryReader.getAvailableQuantities(activeVariants.map((v) => v.id)),
    ]);

    const variants: VariantWithPriceAndStock[] = activeVariants.map((v, i) => {
      const price = prices[i]!;
      const availableQuantity = availability.get(v.id) ?? 0;
      return {
        id: v.id,
        sku: v.sku,
        color: v.color,
        size: v.size,
        weightGrams: v.weightGrams,
        pricePaise: price.pricePaise,
        ratePerKgPaise: price.ratePerKgPaise,
        availableQuantity,
        inStock: availableQuantity > 0,
      };
    });

    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description,
      brand: product.brand,
      category: product.category,
      images: product.images,
      variants,
      metaTitle: product.metaTitle,
      metaDescription: product.metaDescription,
    };
  }
}
