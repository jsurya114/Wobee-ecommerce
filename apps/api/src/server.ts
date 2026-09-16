import { prisma } from "@woobe/database";
import { createApp } from "./app";
import { env } from "./config/env";
import { redis } from "./config/redis";

const READINESS_TIMEOUT_MS = 1500;

async function withTimeout(promise: Promise<unknown>, ms: number): Promise<boolean> {
  const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms));
  return Promise.race([promise.then(() => true).catch(() => false), timeout]);
}

const app = createApp({
  checkReadiness: async () => {
    const [databaseOk, redisOk] = await Promise.all([
      withTimeout(prisma.$queryRaw`SELECT 1`, READINESS_TIMEOUT_MS),
      withTimeout(redis.ping(), READINESS_TIMEOUT_MS),
    ]);
    return { ready: databaseOk && redisOk, details: { database: databaseOk, redis: redisOk } };
  },
});

const server = app.listen(env.API_PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[api] listening on http://localhost:${env.API_PORT} (${env.NODE_ENV})`);
});

async function shutdown(signal: string): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[api] received ${signal}, shutting down gracefully...`);
  server.close(async () => {
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  });
  // Force-exit if graceful shutdown hangs.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
