import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      NODE_ENV: "test",
      // Ports match this repo's docker-compose.yml remap (5433/6380) — see journal.md.
      DATABASE_URL: "postgresql://woobe:woobe_dev_password@localhost:5433/woobe_test?schema=public",
      REDIS_URL: "redis://localhost:6380/1",
      JWT_ACCESS_SECRET: "test-access-secret",
      JWT_REFRESH_SECRET: "test-refresh-secret",
      COOKIE_SECRET: "test-cookie-secret",
    },
  },
});
