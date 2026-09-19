import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * env.ts validates at import time and calls process.exit(1) on failure, so it is exercised the way the
 * app really uses it: the real module is loaded in a child process (tsx, like production) with a controlled
 * environment, and we look at the exit status and what it printed. No mocking of the schema.
 */
const API_DIR = path.resolve(__dirname, "../..");
const TSX = path.join(API_DIR, "node_modules", ".bin", "tsx");
const ROOT_ENV = path.resolve(API_DIR, "../../.env");

const BASE_ENV: Record<string, string> = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://x:y@localhost:1/d",
  REDIS_URL: "redis://localhost:1",
  JWT_ACCESS_SECRET: "a",
  JWT_REFRESH_SECRET: "b",
  COOKIE_SECRET: "c",
};

function loadEnv(extra: Record<string, string>): { status: number | null; output: string } {
  const result = spawnSync(
    TSX,
    ["-e", "import('./src/config/env').then((m) => console.log('BIND=' + JSON.stringify(m.env.API_BIND_HOST)))"],
    {
      cwd: API_DIR,
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...BASE_ENV, ...extra },
      encoding: "utf8",
      timeout: 30_000,
    },
  );
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

// env.ts also reads the developer's root .env for variables not already set; if that file defines
// API_BIND_HOST, "unset" cannot be tested on this machine (CI has no such file).
let rootEnvSetsBindHost = false;
try {
  rootEnvSetsBindHost = /^\s*API_BIND_HOST\s*=/m.test(readFileSync(ROOT_ENV, "utf8"));
} catch {
  // no root .env — the normal case in CI
}

describe("API_BIND_HOST env parsing", () => {
  it.skipIf(rootEnvSetsBindHost)(
    "unset is accepted and stays undefined (today's behavior: listen on every interface)",
    () => {
      const { status, output } = loadEnv({});
      expect(status).toBe(0);
      expect(output).toContain("BIND=undefined");
    },
    30_000,
  );

  it("127.0.0.1 is accepted", () => {
    const { status, output } = loadEnv({ API_BIND_HOST: "127.0.0.1" });
    expect(status).toBe(0);
    expect(output).toContain('BIND="127.0.0.1"');
  }, 30_000);

  it("::1 is accepted", () => {
    const { status, output } = loadEnv({ API_BIND_HOST: "::1" });
    expect(status).toBe(0);
    expect(output).toContain('BIND="::1"');
  }, 30_000);

  it.each([
    ["blank", ""],
    ["localhost", "localhost"],
    ["a malformed IP", "999.1.1.1"],
  ])("%s is rejected at startup, naming API_BIND_HOST", (_label, value) => {
    const { status, output } = loadEnv({ API_BIND_HOST: value });
    expect(status).toBe(1);
    expect(output).toContain("API_BIND_HOST");
    expect(output).toContain("Invalid ip");
    expect(output).not.toContain("BIND=");
  }, 30_000);
});
