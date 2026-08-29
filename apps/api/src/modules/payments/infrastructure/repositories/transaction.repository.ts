import { prisma } from "@woobe/database";
import type { TransactionPort } from "../../application/ports/transaction.port";

/**
 * ADR-010: one of three files in the payments module allowed to import
 * @woobe/database (with payment.repository.ts and webhook-event.repository.ts).
 * Same Unit-of-Work pattern as orders/infrastructure/repositories/transaction.repository.ts
 * — see that file's comment for the full rationale.
 */
export class PrismaTransactionRunner implements TransactionPort {
  run<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    return prisma.$transaction((tx) => fn(tx));
  }
}
