import { prisma } from "@woobe/database";
import type { TransactionPort } from "../../application/ports/transaction.port";

/**
 * ADR-010: one of two files in the orders module allowed to import
 * @woobe/database (with order.repository.ts) — enforced by
 * apps/api/.dependency-cruiser.cjs. Owns starting the checkout Unit-of-Work
 * transaction; the opaque `tx` handle it hands the callback is a real
 * Prisma transaction client, but only each participating module's own
 * infrastructure (order.repository.ts, cart/inventory's repositories) ever
 * casts it back to one — see TransactionPort's own comment.
 */
export class PrismaTransactionRunner implements TransactionPort {
  run<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    return prisma.$transaction((tx) => fn(tx));
  }
}
