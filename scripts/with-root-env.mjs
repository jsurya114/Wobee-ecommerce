#!/usr/bin/env node
/**
 * Loads the monorepo root `.env` (best-effort — never overrides a variable
 * the process already has, same as apps/api's config/env.ts) then runs the
 * given command with that environment. Prefixes packages/database's Prisma
 * CLI scripts (migrate:dev, migrate:deploy, seed, studio) — those need
 * DATABASE_URL/SHADOW_DATABASE_URL and, unlike apps/api, have no TS
 * entrypoint of their own to load `.env` from (Week 2 Day 0 bootstrap
 * remediation — see journal.md, 2026-08-27).
 *
 * Usage: node scripts/with-root-env.mjs <command> [...args]
 * Uses spawnSync with an argv array (no shell), not a shell string — the
 * command/args here are always this repo's own fixed script definitions in
 * package.json, never external input.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  process.loadEnvFile(path.join(repoRoot, ".env"));
} catch {
  // No root .env (CI injects vars directly, or a developer exports their own) — fine.
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("Usage: node scripts/with-root-env.mjs <command> [...args]");
  process.exit(1);
}

const result = spawnSync(command, args, { stdio: "inherit", env: process.env, cwd: repoRoot });
process.exit(result.status ?? 1);
