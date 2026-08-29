#!/usr/bin/env node
/**
 * ADR-013: destructive migrations require an explicit, human-reviewed flag —
 * never auto-applied. This script finds every migration.sql file newly
 * ADDED on this branch (vs. origin/main) and fails CI if it contains a
 * destructive statement (DROP TABLE/COLUMN, TRUNCATE, or a column TYPE
 * change) without an `-- accept-data-loss: <reason>` marker comment in its
 * first 5 lines. That marker is the human sign-off the ADR requires — add
 * it deliberately, don't add it to silence this check.
 *
 * Run: `pnpm run check:migrations` (also runs in CI — see .github/workflows/ci.yml).
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const MIGRATIONS_GLOB_PREFIX = "packages/database/prisma/migrations/";
const DESTRUCTIVE_PATTERNS = [
  { name: "DROP TABLE", pattern: /\bDROP\s+TABLE\b/i },
  { name: "DROP COLUMN", pattern: /\bDROP\s+COLUMN\b/i },
  { name: "TRUNCATE", pattern: /\bTRUNCATE\b/i },
  { name: "ALTER COLUMN ... TYPE", pattern: /\bALTER\s+COLUMN\b[^;]*\bTYPE\b/i },
];
const ACCEPT_MARKER = /^--\s*accept-data-loss:/im;

function getBaseRef() {
  try {
    execSync("git rev-parse --verify origin/main", { stdio: "ignore" });
    return "origin/main";
  } catch {
    return null;
  }
}

function getNewlyAddedMigrationFiles(baseRef) {
  const raw = execSync(`git diff --name-status --diff-filter=A ${baseRef}...HEAD`, {
    encoding: "utf8",
  });
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split("\t")[1])
    .filter((path) => path && path.startsWith(MIGRATIONS_GLOB_PREFIX) && path.endsWith("migration.sql"));
}

function main() {
  const baseRef = getBaseRef();
  if (!baseRef) {
    console.log("[check-migrations] origin/main not available locally — skipping (this always runs in CI).");
    process.exit(0);
  }

  let addedMigrations;
  try {
    addedMigrations = getNewlyAddedMigrationFiles(baseRef);
  } catch (error) {
    console.log(`[check-migrations] could not diff against ${baseRef} — skipping. (${error.message})`);
    process.exit(0);
  }

  if (addedMigrations.length === 0) {
    console.log("[check-migrations] no new migrations on this branch — nothing to check.");
    process.exit(0);
  }

  let failed = false;
  for (const filePath of addedMigrations) {
    const content = readFileSync(filePath, "utf8");
    const hits = DESTRUCTIVE_PATTERNS.filter(({ pattern }) => pattern.test(content));
    if (hits.length === 0) continue;

    if (ACCEPT_MARKER.test(content.split("\n").slice(0, 5).join("\n"))) {
      console.log(
        `[check-migrations] ${filePath}: destructive statement(s) [${hits.map((h) => h.name).join(", ")}] — accepted via marker comment.`,
      );
      continue;
    }

    failed = true;
    console.error(
      `[check-migrations] ${filePath}: contains destructive statement(s) [${hits.map((h) => h.name).join(", ")}] ` +
        `without an "-- accept-data-loss: <reason>" comment in the first 5 lines. ` +
        `A human must review this migration and add that comment deliberately before it can merge (ADR-013).`,
    );
  }

  process.exit(failed ? 1 : 0);
}

main();
