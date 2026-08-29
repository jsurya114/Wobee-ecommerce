import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Every integration test in this package runs against the ONE real
    // `woobe_test` Postgres (no mocking — this repo's own convention). Vitest's
    // default multi-file parallelism let unrelated files contend for the same
    // seed rows / FKs / connections, producing a reproducible ~60% flake rate
    // (scattered assertion / FK-violation / HTTP-parse failures, no single
    // culprit). Running files sequentially cuts that sharply — clean-DB
    // measurement: 4/5 full runs green, the one failure a pre-existing
    // intra-file race (home Best-Sellers ordering) that passes in isolation.
    // Full determinism would need a per-file database — out of scope here.
    // Tests within a file still run concurrently.
    fileParallelism: false,
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
