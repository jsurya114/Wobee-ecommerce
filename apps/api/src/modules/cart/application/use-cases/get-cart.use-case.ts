import { computeCartTotals } from "../../domain/compute-cart-totals";
import type { CartRepositoryPort } from "../ports/cart-repository.port";
import type { InventoryReaderPort } from "../ports/inventory-reader.port";
import type { PricingReaderPort } from "../ports/pricing-reader.port";
import type { VariantCatalogPort } from "../ports/variant-catalog.port";

export interface CartLineView {
  itemId: string;
  variantId: string;
  productSlug: string;
  productName: string;
  image: string | null;
  color: string;
  size: string;
  weightGrams: number;
  ratePerKgPaise: number;
  unitPricePaise: number;
  quantity: number;
  subtotalPaise: number;
  availableQuantity: number;
  isAvailable: boolean;
}

export interface CartView {
  cartId: string;
  items: CartLineView[];
  itemCount: number;
  totalWeightGrams: number;
  totalPaise: number;
}

/**
 * The core of ADR-011: weight, price, and subtotal are recalculated here
 * from LIVE Product/ProductVariant/PricingSetting/Inventory state on every
 * call — never read back from a stored per-line value (there isn't one;
 * CartItem only stores variantId + quantity, see schema.prisma). This is
 * also what makes "tamper with a client-sent price" a no-op: nothing here
 * ever reads a price the client sent.
 */
export class GetCartUseCase {
  constructor(
    private readonly cartRepository: CartRepositoryPort,
    private readonly variantCatalog: VariantCatalogPort,
    private readonly pricingReader: PricingReaderPort,
    private readonly inventoryReader: InventoryReaderPort,
  ) {}

  async execute(cartId: string): Promise<CartView> {
    const items = await this.cartRepository.findItems(cartId);
    if (items.length === 0) {
      return { cartId, items: [], itemCount: 0, totalWeightGrams: 0, totalPaise: 0 };
    }

    const variantIds = items.map((item) => item.variantId);
    const [variantDetails, availability] = await Promise.all([
      this.variantCatalog.getVariants(variantIds),
      this.inventoryReader.getAvailableQuantities(variantIds),
    ]);

    // A variant no longer resolvable (e.g. hard-deleted) is dropped from the
    // view rather than crashing the whole cart — defensive, shouldn't
    // happen in practice since products are soft-deleted (isActive), not removed.
    const resolvedItems = items
      .map((item) => ({ item, variant: variantDetails.get(item.variantId) }))
      .filter((entry): entry is { item: (typeof items)[number]; variant: NonNullable<typeof entry.variant> } =>
        Boolean(entry.variant),
      );

    const prices = await this.pricingReader.calculateMany(
      resolvedItems.map(({ variant }) => ({
        weightGrams: variant.weightGrams,
        ratePerKgOverridePaise: variant.ratePerKgOverridePaise,
      })),
    );

    const lines: CartLineView[] = resolvedItems.map(({ item, variant }, i) => {
      const price = prices[i]!;
      const availableQuantity = availability.get(item.variantId) ?? 0;
      return {
        itemId: item.id,
        variantId: item.variantId,
        productSlug: variant.productSlug,
        productName: variant.productName,
        image: variant.image,
        color: variant.color,
        size: variant.size,
        weightGrams: variant.weightGrams,
        ratePerKgPaise: price.ratePerKgPaise,
        unitPricePaise: price.pricePaise,
        quantity: item.quantity,
        subtotalPaise: price.pricePaise * item.quantity,
        availableQuantity,
        isAvailable: variant.isActive && item.quantity <= availableQuantity,
      };
    });

    const totals = computeCartTotals(lines.map((l) => ({ quantity: l.quantity, unitPricePaise: l.unitPricePaise, weightGrams: l.weightGrams })));

    return { cartId, items: lines, ...totals };
  }
}
