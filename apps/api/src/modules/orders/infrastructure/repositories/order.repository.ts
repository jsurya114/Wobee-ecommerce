import { Prisma } from "@woobe/database";
import type { OrderEntity, OrderAddressSnapshot } from "../../domain/entities/order.entity";
import { OrderNumberCollisionError } from "../../domain/errors/order-number-collision.error";
import type { CreateOrderInput, OrderRepositoryPort } from "../../application/ports/order-repository.port";

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
              unitRatePerKgPaise: item.unitRatePerKgPaise,
              unitPricePaise: item.unitPricePaise,
              quantity: item.quantity,
              lineTotalPaise: item.lineTotalPaise,
              taxAmountPaise: item.taxAmountPaise,
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
    items: order.items.map((item) => ({
      id: item.id,
      variantId: item.variantId,
      productNameSnapshot: item.productNameSnapshot,
      skuSnapshot: item.skuSnapshot,
      color: item.color,
      size: item.size,
      weightGrams: item.weightGrams,
      unitRatePerKgPaise: item.unitRatePerKgPaise,
      unitPricePaise: item.unitPricePaise,
      quantity: item.quantity,
      lineTotalPaise: item.lineTotalPaise,
      taxAmountPaise: item.taxAmountPaise,
    })),
  };
}
