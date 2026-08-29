import { Prisma, prisma } from "@woobe/database";
import type { ReturnStatus } from "@woobe/types";
import type { ReturnEntity, ReturnItemEntity } from "../../domain/entities/return.entity";
import type {
  AdminReturnSummaryEntity,
  CreateReturnInput,
  ListReturnsFilter,
  ListReturnsResult,
  ReturnLineForOrder,
  ReturnRepositoryPort,
  ReturnSummaryEntity,
  TransitionReturnStatusResult,
} from "../../application/ports/return-repository.port";

const TERMINAL_STATUSES: ReturnStatus[] = ["RETURN_REJECTED", "REFUNDED"];

/**
 * ADR-010: the ONLY file in the returns module allowed to import
 * @woobe/database (enforced by apps/api/.dependency-cruiser.cjs). Owns
 * Return/ReturnItem only — Order is read through this module's own
 * OrderReaderPort, never a direct Prisma query here.
 */
export class ReturnRepository implements ReturnRepositoryPort {
  async create(input: CreateReturnInput): Promise<ReturnEntity> {
    const created = await prisma.return.create({
      data: {
        orderId: input.orderId,
        reason: input.reason,
        items: {
          create: input.items.map((item) => ({
            orderItemId: item.orderItemId,
            quantity: item.quantity,
            reasonDetail: item.reasonDetail,
          })),
        },
      },
      include: { items: true },
    });
    return toEntity(created);
  }

  async findById(returnId: string): Promise<ReturnEntity | null> {
    const found = await prisma.return.findUnique({ where: { id: returnId }, include: { items: true } });
    return found ? toEntity(found) : null;
  }

  async findLinesByOrderId(orderId: string): Promise<ReturnLineForOrder[]> {
    const returns = await prisma.return.findMany({ where: { orderId }, include: { items: true } });
    return returns.flatMap((ret) =>
      ret.items.map((item) => ({ orderItemId: item.orderItemId, quantity: item.quantity, status: ret.status })),
    );
  }

  async findSummariesByUserId(userId: string, orderId?: string): Promise<ReturnSummaryEntity[]> {
    const returns = await prisma.return.findMany({
      where: { order: { userId }, ...(orderId ? { orderId } : {}) },
      orderBy: { requestedAt: "desc" },
      include: { order: { select: { orderNumber: true } }, _count: { select: { items: true } } },
    });
    return returns.map(toSummary);
  }

  async findAllPaginated(filter: ListReturnsFilter): Promise<ListReturnsResult> {
    const where: Prisma.ReturnWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.orderId ? { orderId: filter.orderId } : {}),
    };

    const [returns, total] = await Promise.all([
      prisma.return.findMany({
        where,
        orderBy: { requestedAt: "desc" },
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
        include: {
          order: { select: { orderNumber: true, contactName: true, contactEmail: true } },
          _count: { select: { items: true } },
        },
      }),
      prisma.return.count({ where }),
    ]);

    return {
      items: returns.map(
        (ret): AdminReturnSummaryEntity => ({
          ...toSummary(ret),
          contactName: ret.order.contactName,
          contactEmail: ret.order.contactEmail,
        }),
      ),
      total,
    };
  }

  async transitionStatus(
    returnId: string,
    from: ReturnStatus,
    to: ReturnStatus,
    extraFields?: Partial<Pick<ReturnEntity, "resolvedAt">>,
  ): Promise<TransitionReturnStatusResult> {
    const { count } = await prisma.return.updateMany({ where: { id: returnId, status: from }, data: { status: to, ...extraFields } });
    const found = await prisma.return.findUniqueOrThrow({ where: { id: returnId }, include: { items: true } });
    return { changed: count > 0, return: toEntity(found) };
  }

  async countActiveByOrderId(orderId: string): Promise<number> {
    return prisma.return.count({ where: { orderId, status: { notIn: TERMINAL_STATUSES } } });
  }
}

type ReturnWithItems = Prisma.ReturnGetPayload<{ include: { items: true } }>;

function toEntity(ret: ReturnWithItems): ReturnEntity {
  return {
    id: ret.id,
    orderId: ret.orderId,
    status: ret.status,
    reason: ret.reason,
    requestedAt: ret.requestedAt,
    resolvedAt: ret.resolvedAt,
    items: ret.items.map(toItemEntity),
  };
}

function toItemEntity(item: { id: string; orderItemId: string; quantity: number; reasonDetail: string | null }): ReturnItemEntity {
  return { id: item.id, orderItemId: item.orderItemId, quantity: item.quantity, reasonDetail: item.reasonDetail };
}

function toSummary(ret: { id: string; orderId: string; status: ReturnStatus; reason: string; requestedAt: Date; resolvedAt: Date | null; order: { orderNumber: string }; _count: { items: number } }): ReturnSummaryEntity {
  return {
    id: ret.id,
    orderId: ret.orderId,
    orderNumber: ret.order.orderNumber,
    status: ret.status,
    reason: ret.reason,
    requestedAt: ret.requestedAt,
    resolvedAt: ret.resolvedAt,
    itemCount: ret._count.items,
  };
}
