import { Prisma, prisma } from "@woobe/database";
import type { PaymentEntity } from "../../domain/entities/payment.entity";
import type {
  CreatePaymentInput,
  PaymentRepositoryPort,
  UpdatePaymentInput,
} from "../../application/ports/payment-repository.port";

/** The only shape a `tx` handle from this module's write methods is ever cast to — see PaymentRepositoryPort's own comments. */
type PrismaTx = Prisma.TransactionClient;

/**
 * ADR-010: one of three files in the payments module allowed to import
 * @woobe/database (with webhook-event.repository.ts and
 * transaction.repository.ts) — enforced by apps/api/.dependency-cruiser.cjs.
 */
export class PaymentRepository implements PaymentRepositoryPort {
  async create(input: CreatePaymentInput, tx?: unknown): Promise<PaymentEntity> {
    const client = (tx as PrismaTx | undefined) ?? prisma;
    const payment = await client.payment.create({
      data: {
        orderId: input.orderId,
        provider: input.provider,
        status: input.status,
        amountPaise: input.amountPaise,
        razorpayOrderId: input.razorpayOrderId,
      },
    });
    return toEntity(payment);
  }

  async findByOrderId(orderId: string): Promise<PaymentEntity | null> {
    const payment = await prisma.payment.findFirst({ where: { orderId }, orderBy: { createdAt: "desc" } });
    return payment ? toEntity(payment) : null;
  }

  async findByRazorpayOrderId(razorpayOrderId: string): Promise<PaymentEntity | null> {
    const payment = await prisma.payment.findFirst({ where: { razorpayOrderId } });
    return payment ? toEntity(payment) : null;
  }

  async update(id: string, input: UpdatePaymentInput, tx: unknown): Promise<PaymentEntity> {
    const client = tx as PrismaTx;
    const payment = await client.payment.update({
      where: { id },
      data: {
        status: input.status,
        razorpayPaymentId: input.razorpayPaymentId,
        razorpaySignature: input.razorpaySignature,
      },
    });
    return toEntity(payment);
  }

  async markRefunded(paymentId: string, tx?: unknown): Promise<void> {
    const client = (tx as PrismaTx | undefined) ?? prisma;
    await client.payment.update({ where: { id: paymentId }, data: { status: "REFUNDED" } });
  }
}

function toEntity(payment: {
  id: string;
  orderId: string;
  provider: string;
  status: string;
  amountPaise: number;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  razorpaySignature: string | null;
}): PaymentEntity {
  return {
    id: payment.id,
    orderId: payment.orderId,
    provider: payment.provider as PaymentEntity["provider"],
    status: payment.status as PaymentEntity["status"],
    amountPaise: payment.amountPaise,
    razorpayOrderId: payment.razorpayOrderId,
    razorpayPaymentId: payment.razorpayPaymentId,
    razorpaySignature: payment.razorpaySignature,
  };
}
