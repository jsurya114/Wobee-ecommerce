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
      // Not real Razorpay credentials (see DECISIONS_PENDING.md #4) — just
      // enough for RazorpayService.verifyWebhookSignature's HMAC check to
      // run in tests. RAZORPAY_KEY_ID/KEY_SECRET stay unset: no test here
      // creates a real Razorpay order (that needs the network), so
      // RazorpayService.createOrder's "not configured" guard is what's
      // actually exercised for that path.
      RAZORPAY_WEBHOOK_SECRET: "test-webhook-secret",
    },
  },
});
