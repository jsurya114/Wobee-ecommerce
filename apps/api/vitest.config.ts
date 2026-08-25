import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://woobe:woobe_dev_password@localhost:5432/woobe_test?schema=public",
      REDIS_URL: "redis://localhost:6379/1",
      JWT_ACCESS_SECRET: "test-access-secret",
      JWT_REFRESH_SECRET: "test-refresh-secret",
      COOKIE_SECRET: "test-cookie-secret",
    },
  },
});
