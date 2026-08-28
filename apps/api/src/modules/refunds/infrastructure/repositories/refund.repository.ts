import { prisma } from "@woobe/database";
import type { RefundEntity } from "../../domain/entities/refund.entity";
import type { CreateRefundInput, RefundRepositoryPort } from "../../application/ports/refund-repository.port";

/** ADR-010: the only file in this module allowed to import @woobe/database, and only for the Refund table it owns — never Payment (ADR-025). */
export class RefundRepository implements RefundRepositoryPort {
  async findByOrderId(orderId: string): Promise<RefundEntity | null> {
    const refund = await prisma.refund.findFirst({ where: { orderId }, orderBy: { createdAt: "desc" } });
    return refund ? toEntity(refund) : null;
  }

  async findByReturnId(returnId: string): Promise<RefundEntity | null> {
    const refund = await prisma.refund.findFirst({ where: { returnId }, orderBy: { createdAt: "desc" } });
    return refund ? toEntity(refund) : null;
  }

  async create(input: CreateRefundInput): Promise<RefundEntity> {
    const refund = await prisma.refund.create({
      data: {
        orderId: input.orderId,
        returnId: input.returnId,
        provider: input.provider,
        status: input.status,
        amountPaise: input.amountPaise,
        providerRefundId: input.providerRefundId,
      },
    });
    return toEntity(refund);
  }

  async markCompletedByReturnId(returnId: string): Promise<void> {
    await prisma.refund.updateMany({ where: { returnId }, data: { status: "COMPLETED" } });
  }
}

function toEntity(refund: {
  id: string;
  orderId: string;
  returnId: string | null;
  provider: string;
  status: string;
  amountPaise: number;
  providerRefundId: string | null;
  createdAt: Date;
}): RefundEntity {
  return {
    id: refund.id,
    orderId: refund.orderId,
    returnId: refund.returnId,
    provider: refund.provider as RefundEntity["provider"],
    status: refund.status as RefundEntity["status"],
    amountPaise: refund.amountPaise,
    providerRefundId: refund.providerRefundId,
    createdAt: refund.createdAt,
  };
}
