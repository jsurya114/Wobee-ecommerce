import { Prisma, prisma, type OrderStatus } from "@woobe/database";
import type { OrderEntity, OrderAddressSnapshot, OrderSummaryEntity } from "../../domain/entities/order.entity";
import { bucketDailyRevenue } from "../../domain/bucket-daily-revenue";
import { OrderNumberCollisionError } from "../../domain/errors/order-number-collision.error";
import type {
  CreateOrderInput,
  OrderRepositoryPort,
  TransitionOrderStatusResult,
  ListOrdersFilter,
  ListOrdersResult,
  VariantSaleQuantity,
  AnalyticsDateRange,
  OrderAnalyticsSummary,
} from "../../application/ports/order-repository.port";

/** Same "counts as a real sale" status set hasUserPurchasedProduct already uses below — kept as one named constant so both stay in sync by construction. Not `as const`: Prisma's own `OrderStatus[]` filter type wants a plain mutable array, not a readonly tuple. */
const SOLD_STATUSES: OrderStatus[] = ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"];

/** The only shape `createWithItems`'s opaque `tx` handle is ever cast to — see OrderRepositoryPort's own comment. */
type PrismaTx = Prisma.TransactionClient;

/**
 * ADR-010: one of two files in the orders module allowed to import
 * @woobe/database (with transaction.repository.ts) — enforced by
 * apps/api/.dependency-cruiser.cjs.
 */
export class OrderRepository implements OrderRepositoryPort {
  async createWithItems(input: CreateOrderInput, tx: unknown): Promise<OrderEntity> {
    const client = tx as PrismaTx;

    try {
      const order = await client.order.create({
        data: {
          orderNumber: input.orderNumber,
          userId: input.userId,
          contactName: input.contactName,
          contactPhone: input.contactPhone,
          contactEmail: input.contactEmail,
          shippingSnapshot: input.shippingSnapshot as unknown as Prisma.InputJsonValue,
          subtotalPaise: input.subtotalPaise,
          discountPaise: input.discountPaise,
          shippingFeePaise: input.shippingFeePaise,
          taxPaise: input.taxPaise,
          totalPaise: input.totalPaise,
          totalWeightGrams: input.totalWeightGrams,
          paymentMethod: input.paymentMethod,
          items: {
            create: input.items.map((item) => ({
              variantId: item.variantId,
              productNameSnapshot: item.productNameSnapshot,
              skuSnapshot: item.skuSnapshot,
              color: item.color,
              size: item.size,
              weightGrams: item.weightGrams,
              pricingMode: item.pricingMode,
              unitRatePerKgPaise: item.unitRatePerKgPaise,
              unitPricePaise: item.unitPricePaise,
              quantity: item.quantity,
              lineTotalPaise: item.lineTotalPaise,
              taxAmountPaise: item.taxAmountPaise,
              discountPaise: item.discountPaise,
            })),
          },
        },
        include: { items: true },
      });

      return toEntity(order);
    } catch (error) {
      // P2002 on the orderNumber unique constraint specifically — meta.target
      // distinguishes it from any other unique violation this create could
      // theoretically hit, so only a genuine collision triggers a retry.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        (error.meta?.target as string[] | undefined)?.includes("orderNumber")
      ) {
        throw new OrderNumberCollisionError();
      }
      throw error;
    }
  }

  async findById(orderId: string): Promise<OrderEntity | null> {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
    return order ? toEntity(order) : null;
  }

  async findByOrderNumber(orderNumber: string): Promise<OrderEntity | null> {
    const order = await prisma.order.findUnique({ where: { orderNumber }, include: { items: true } });
    return order ? toEntity(order) : null;
  }

  async attachToUser(orderId: string, userId: string): Promise<boolean> {
    const result = await prisma.order.updateMany({ where: { id: orderId, userId: null }, data: { userId } });
    return result.count > 0;
  }

  async findSummariesByUserId(userId: string): Promise<OrderSummaryEntity[]> {
    const orders = await prisma.order.findMany({
      where: { userId },
      orderBy: { placedAt: "desc" },
      // Week 3 Day 9 perf review — this had no cap at all (flagged, not yet
      // fixed, on Day 6): a customer's whole order history in one
      // unbounded query on every "My Orders" load. 100 is generous headroom
      // over any real customer's history today; a genuine "load more" UI is
      // a bigger, separate change this narrow fix doesn't attempt.
      take: 100,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentMethod: true,
        totalPaise: true,
        placedAt: true,
        _count: { select: { items: true } },
      },
    });
    return orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentMethod: order.paymentMethod,
      totalPaise: order.totalPaise,
      itemCount: order._count.items,
      placedAt: order.placedAt,
    }));
  }

  async transitionStatus(
    orderId: string,
    from: OrderEntity["status"],
    to: OrderEntity["status"],
    tx: unknown,
    extraFields?: Partial<
      Pick<OrderEntity, "trackingNumber" | "carrier" | "shippedAt" | "deliveredAt" | "cancelledAt" | "cancellationReason">
    >,
  ): Promise<TransitionOrderStatusResult> {
    const client = tx as PrismaTx;
    const { count } = await client.order.updateMany({
      where: { id: orderId, status: from },
      data: { status: to, ...extraFields },
    });
    const order = await client.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    return { changed: count > 0, order: toEntity(order) };
  }

  async findAllPaginated(filter: ListOrdersFilter): Promise<ListOrdersResult> {
    const where: Prisma.OrderWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.search
        ? {
            OR: [
              { orderNumber: { contains: filter.search, mode: "insensitive" } },
              { contactEmail: { contains: filter.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { placedAt: "desc" },
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentMethod: true,
          contactName: true,
          contactEmail: true,
          totalPaise: true,
          placedAt: true,
          _count: { select: { items: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);

    return {
      items: orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentMethod: order.paymentMethod,
        contactName: order.contactName,
        contactEmail: order.contactEmail,
        totalPaise: order.totalPaise,
        itemCount: order._count.items,
        placedAt: order.placedAt,
      })),
      total,
    };
  }

  async setHasActiveReturn(orderId: string, value: boolean): Promise<void> {
    await prisma.order.update({ where: { id: orderId }, data: { hasActiveReturn: value } });
  }

  async hasUserPurchasedProduct(userId: string, productId: string): Promise<boolean> {
    const match = await prisma.orderItem.findFirst({
      where: {
        variant: { productId },
        order: {
          userId,
          status: { in: SOLD_STATUSES },
        },
      },
      select: { id: true },
    });
    return match !== null;
  }

  async findBestSellingVariantQuantities(limit: number): Promise<VariantSaleQuantity[]> {
    const rows = await prisma.orderItem.groupBy({
      by: ["variantId"],
      where: { order: { status: { in: SOLD_STATUSES } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: limit,
    });
    return rows.map((row) => ({ variantId: row.variantId, quantitySold: row._sum?.quantity ?? 0 }));
  }

  async getOrderAnalytics(range: AnalyticsDateRange): Promise<OrderAnalyticsSummary> {
    const dateFilter = { gte: range.from, lte: range.to };

    const [revenue, statusRows, soldOrders] = await Promise.all([
      prisma.order.aggregate({
        where: { status: { in: SOLD_STATUSES }, placedAt: dateFilter },
        _sum: { totalPaise: true },
        _count: true,
      }),
      // Every status in range, not just SOLD_STATUSES — see OrderStatusCount's own doc comment.
      prisma.order.groupBy({ by: ["status"], where: { placedAt: dateFilter }, _count: true }),
      // Daily buckets, computed here rather than via a raw SQL date-trunc:
      // dashboard-scale row counts (weeks of orders, not millions) make an
      // in-memory group-by both simpler and safer than a dialect-specific
      // query. bucketDailyRevenue (domain) owns the actual bucketing/filling logic.
      prisma.order.findMany({
        where: { status: { in: SOLD_STATUSES }, placedAt: dateFilter },
        select: { placedAt: true, totalPaise: true },
      }),
    ]);

    return {
      totalRevenuePaise: revenue._sum.totalPaise ?? 0,
      orderCount: revenue._count,
      dailyRevenue: bucketDailyRevenue(range, soldOrders),
      statusCounts: statusRows.map((row) => ({ status: row.status, count: row._count })),
    };
  }
}

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

function toEntity(order: OrderWithItems): OrderEntity {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    userId: order.userId,
    status: order.status,
    contactName: order.contactName,
    contactPhone: order.contactPhone,
    contactEmail: order.contactEmail,
    shippingSnapshot: order.shippingSnapshot as unknown as OrderAddressSnapshot,
    subtotalPaise: order.subtotalPaise,
    discountPaise: order.discountPaise,
    shippingFeePaise: order.shippingFeePaise,
    taxPaise: order.taxPaise,
    totalPaise: order.totalPaise,
    totalWeightGrams: order.totalWeightGrams,
    paymentMethod: order.paymentMethod,
    placedAt: order.placedAt,
    trackingNumber: order.trackingNumber,
    carrier: order.carrier,
    shippedAt: order.shippedAt,
    deliveredAt: order.deliveredAt,
    cancelledAt: order.cancelledAt,
    cancellationReason: order.cancellationReason,
    hasActiveReturn: order.hasActiveReturn,
    items: order.items.map((item) => ({
      id: item.id,
      variantId: item.variantId,
      productNameSnapshot: item.productNameSnapshot,
      skuSnapshot: item.skuSnapshot,
      color: item.color,
      size: item.size,
      weightGrams: item.weightGrams,
      pricingMode: item.pricingMode,
      unitRatePerKgPaise: item.unitRatePerKgPaise,
      unitPricePaise: item.unitPricePaise,
      quantity: item.quantity,
      lineTotalPaise: item.lineTotalPaise,
      taxAmountPaise: item.taxAmountPaise,
      discountPaise: item.discountPaise,
    })),
  };
}
