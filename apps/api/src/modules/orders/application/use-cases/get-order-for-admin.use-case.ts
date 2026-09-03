import { NotFoundError } from "../../../../shared/errors";
import type { OrderEntity, OrderItemEntity } from "../../domain/entities/order.entity";
import type { OrderRepositoryPort } from "../ports/order-repository.port";

/** Matches `ResolveProductIdsForVariantsUseCase`'s own `execute` signature (products module, cross-module export). */
interface VariantProductResolver {
  execute(variantIds: string[]): Promise<Map<string, string>>;
}

/** Matches `GetProductsByIdsUseCase`'s own `execute` signature — only `primaryImage` is read here. */
interface ProductImageReader {
  execute(productIds: string[]): Promise<Map<string, { primaryImage: { url: string } | null }>>;
}

export interface AdminOrderItemView extends OrderItemEntity {
  /**
   * The product's CURRENT primary image (live, not snapshotted) — purely
   * a visual aid for the admin order-detail page (client-review request,
   * 2026-09-03). Deliberately not part of `OrderItemEntity` itself: every
   * other field on an order item is a checkout-time snapshot
   * (DEVELOPMENT_RULES.md #1's pricing/weight rule), but an image carries
   * no financial meaning, so showing today's photo (or `null` if the
   * variant/product was since deleted, or the product has no image) is
   * correct and simpler than snapshotting a URL that could 404 later.
   */
  imageUrl: string | null;
}

export interface AdminOrderView extends Omit<OrderEntity, "items"> {
  items: AdminOrderItemView[];
}

/** Admin order lookup — no ownership check (unlike GetOrderUseCase, which is customer-facing and must keep that invariant simple and untouched). */
export class GetOrderForAdminUseCase {
  constructor(
    private readonly orderRepository: OrderRepositoryPort,
    private readonly variantProductResolver: VariantProductResolver,
    private readonly productImageReader: ProductImageReader,
  ) {}

  async execute(orderId: string): Promise<AdminOrderView> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundError("Order not found");
    }
    if (order.items.length === 0) {
      return { ...order, items: [] };
    }

    const productIdByVariant = await this.variantProductResolver.execute(order.items.map((item) => item.variantId));
    const productIds = Array.from(new Set(productIdByVariant.values()));
    const products = productIds.length > 0 ? await this.productImageReader.execute(productIds) : new Map();

    const items: AdminOrderItemView[] = order.items.map((item) => {
      const productId = productIdByVariant.get(item.variantId);
      const product = productId ? products.get(productId) : undefined;
      return { ...item, imageUrl: product?.primaryImage?.url ?? null };
    });

    return { ...order, items };
  }
}
