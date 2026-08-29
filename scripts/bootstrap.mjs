#!/usr/bin/env node
/**
 * Woobe fresh-environment bootstrap — Week 2 Day 0 Part C
 * (project_planning/week2 (1).md §36).
 *
 * Every step here is idempotent — safe to re-run on a machine that's
 * already set up. This script deliberately does NOT try to start Postgres/
 * Redis itself: this repo has been run against Docker Compose on some
 * machines and two directly-native instances on others (see journal.md,
 * 2026-08-26/27) — trying to guess which one a given machine wants and
 * auto-launching it is more likely to fight a developer's existing setup
 * than help. What this script *can* do reliably regardless of that choice:
 * make sure `.env` exists, generate the Prisma client, apply migrations
 * once something is listening on DATABASE_URL, and tell you exactly what's
 * missing when it isn't.
 *
 * Usage: `pnpm run bootstrap`
 */
import { execSync } from "node:child_process";
import { existsSync, copyFileSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: repoRoot });
}

function step(title) {
  console.log(`\n=== ${title} ===`);
}

/** Best-effort .env-file parse — just enough to find DATABASE_URL/REDIS_URL host:port for the reachability check below, not a general dotenv replacement. */
function readEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const vars = {};
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const match = /^([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\n]*)"?\s*$/.exec(line.trim());
    if (match) vars[match[1]] = match[2];
  }
  return vars;
}

function checkPort(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => done(true));
    socket.on("error", () => done(false));
    socket.on("timeout", () => done(false));
  });
}

function parseHostPort(url, fallbackPort) {
  try {
    const u = new URL(url);
    return { host: u.hostname || "localhost", port: Number(u.port) || fallbackPort };
  } catch {
    return null;
  }
}

async function main() {
  console.log("Woobe bootstrap — fresh-environment setup\n");

  step("1. .env");
  const envPath = path.join(repoRoot, ".env");
  const examplePath = path.join(repoRoot, ".env.example");
  if (!existsSync(envPath)) {
    if (existsSync(examplePath)) {
      copyFileSync(examplePath, envPath);
      console.log("Created .env from .env.example. Dev-default secrets are fine for local work; replace before anything that leaves your machine.");
    } else {
      console.warn("No .env or .env.example found — apps/api will fail its env validation until one exists.");
    }
  } else {
    console.log(".env already exists — leaving it alone.");
  }

  step("2. Prisma client");
  run("pnpm --filter @woobe/database run generate");

  step("3. Postgres / Redis reachability");
  const envVars = readEnvFile(envPath);
  const dbTarget = envVars.DATABASE_URL ? parseHostPort(envVars.DATABASE_URL, 5432) : null;
  const redisTarget = envVars.REDIS_URL ? parseHostPort(envVars.REDIS_URL, 6379) : null;

  const dbUp = dbTarget ? await checkPort(dbTarget.host, dbTarget.port) : false;
  const redisUp = redisTarget ? await checkPort(redisTarget.host, redisTarget.port) : false;

  console.log(`Postgres (${dbTarget ? `${dbTarget.host}:${dbTarget.port}` : "DATABASE_URL not set"}): ${dbUp ? "reachable" : "NOT reachable"}`);
  console.log(`Redis    (${redisTarget ? `${redisTarget.host}:${redisTarget.port}` : "REDIS_URL not set"}): ${redisUp ? "reachable" : "NOT reachable"}`);

  if (!dbUp || !redisUp) {
    console.log(`
Postgres/Redis aren't both reachable yet. Two supported paths — pick whichever this machine already uses:

  Docker (if installed and its daemon is running):
    pnpm run docker:up

  Native (no Docker — see journal.md's 2026-08-26/27 entries for the exact
  commands this project has used before, including the non-default
  5433/6380 ports .env.example expects):
    initdb -D <a data dir> && pg_ctl -D <that dir> -o "-p 5433" start
    redis-server --port 6380 --daemonize yes

Re-run \`pnpm run bootstrap\` once both are up — it'll pick up from here (migrations are the only step that was skipped).
`);
    console.log("Bootstrap stopped before migrations — Postgres/Redis not both reachable yet (see above).");
    return;
  }

  step("4. Migrations (dev database)");
  run("pnpm run db:migrate:deploy");

  console.log(`
Bootstrap complete.

Next steps (not run automatically):
  pnpm run db:seed     # demo data — only if you want it (re-running it is
                        # not yet fully idempotent for pricing/shipping/GST
                        # settings rows, see journal.md's known gaps)
  pnpm run dev          # start apps/api, apps/web, apps/admin together
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
