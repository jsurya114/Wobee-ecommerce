import { PrismaClient } from "../generated/client";

/**
 * Singleton PrismaClient. Imported ONLY by apps/api (ADR-019) — and within
 * apps/api, only by each module's own infrastructure/repositories file
 * (ADR-010), never directly from a use-case or controller.
 *
 * Cached on `globalThis` in development so Next.js-style hot reload (and
 * apps/api's own dev watcher) doesn't exhaust Postgres connections by
 * creating a new client on every reload.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
