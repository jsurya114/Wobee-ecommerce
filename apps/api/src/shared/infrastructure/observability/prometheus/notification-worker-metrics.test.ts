import { EventEmitter } from "node:events";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { Registry } from "@prometheus-io/client";
import { describe, expect, it } from "vitest";
import { classifyFailedAttempt } from "../../../../modules/notifications/infrastructure/queues/classify-failed-attempt";
import { startMetricsServer } from "./metrics-server";
import {
  createNotificationWorkerMetrics,
  createWorkerRegistry,
  NotificationWorkerInstrumentation,
  type QueueCounts,
} from "./notification-worker-metrics";

interface FakeJob {
  attemptsMade: number;
  opts: { attempts?: number };
}

function build(getCounts: () => Promise<QueueCounts> = async () => ({})) {
  const registry = new Registry();
  const metrics = createNotificationWorkerMetrics(registry, getCounts);
  const instrumentation = new NotificationWorkerInstrumentation<FakeJob, Error>(metrics, classifyFailedAttempt);
  const worker = new EventEmitter();
  instrumentation.attach(worker as never);
  return { registry, metrics, instrumentation, worker };
}

async function value(registry: Registry, name: string, labels: Record<string, string> = {}): Promise<number> {
  const all = await registry.getMetricsAsJSON();
  const found = (all.find((m) => m.name === name)?.values ?? []).filter(
    (v) => (v as { metricName?: string }).metricName === undefined || (v as { metricName?: string }).metricName === name,
  );
  return (found as { labels: Record<string, string>; value: number }[])
    .filter((v) => Object.entries(labels).every(([k, val]) => v.labels[k] === val))
    .reduce((sum, v) => sum + v.value, 0);
}

describe("notification worker metrics: retry vs terminal semantics", () => {
  it("a completed job counts once as completed and never as failed", async () => {
    const { registry, worker } = build();
    worker.emit("completed", { attemptsMade: 1, opts: { attempts: 3 } });
    expect(await value(registry, "woobe_notification_jobs_completed_total")).toBe(1);
    expect(await value(registry, "woobe_notification_job_attempt_failures_total")).toBe(0);
    expect(await value(registry, "woobe_notification_jobs_failed_total")).toBe(0);
  });

  it("a RETRYABLE failed attempt is an attempt failure only — not completed, not terminal", async () => {
    const { registry, worker } = build();
    worker.emit("failed", { attemptsMade: 1, opts: { attempts: 3 } }, new Error("smtp timeout"));
    expect(await value(registry, "woobe_notification_job_attempt_failures_total")).toBe(1);
    expect(await value(registry, "woobe_notification_jobs_failed_total")).toBe(0);
    expect(await value(registry, "woobe_notification_jobs_completed_total")).toBe(0);
  });

  it("retry, retry, then success: 2 attempt failures, 1 completion, 0 terminal failures", async () => {
    const { registry, worker } = build();
    worker.emit("failed", { attemptsMade: 1, opts: { attempts: 3 } }, new Error("x"));
    worker.emit("failed", { attemptsMade: 2, opts: { attempts: 3 } }, new Error("x"));
    worker.emit("completed", { attemptsMade: 3, opts: { attempts: 3 } });
    expect(await value(registry, "woobe_notification_job_attempt_failures_total")).toBe(2);
    expect(await value(registry, "woobe_notification_jobs_completed_total")).toBe(1);
    expect(await value(registry, "woobe_notification_jobs_failed_total")).toBe(0);
  });

  it("exhausting attempts is ONE terminal failure (by reason) and never a completion", async () => {
    const { registry, worker } = build();
    worker.emit("failed", { attemptsMade: 1, opts: { attempts: 3 } }, new Error("x"));
    worker.emit("failed", { attemptsMade: 2, opts: { attempts: 3 } }, new Error("x"));
    worker.emit("failed", { attemptsMade: 3, opts: { attempts: 3 } }, new Error("x"));
    expect(await value(registry, "woobe_notification_job_attempt_failures_total")).toBe(3);
    expect(await value(registry, "woobe_notification_jobs_failed_total", { reason: "attempts_exhausted" })).toBe(1);
    expect(await value(registry, "woobe_notification_jobs_failed_total")).toBe(1);
    expect(await value(registry, "woobe_notification_jobs_completed_total")).toBe(0);
  });

  it("an UnrecoverableError is terminal on its FIRST attempt", async () => {
    const { registry, worker } = build();
    const error = Object.assign(new Error("no contact email"), { name: "UnrecoverableError" });
    worker.emit("failed", { attemptsMade: 1, opts: { attempts: 3 } }, error);
    expect(await value(registry, "woobe_notification_jobs_failed_total", { reason: "unrecoverable" })).toBe(1);
    expect(await value(registry, "woobe_notification_jobs_completed_total")).toBe(0);
  });

  it("a failed event with no job (already removed) counts the attempt failure but cannot be attributed as terminal", async () => {
    const { registry, worker } = build();
    worker.emit("failed", undefined, new Error("x"));
    expect(await value(registry, "woobe_notification_job_attempt_failures_total")).toBe(1);
    expect(await value(registry, "woobe_notification_jobs_failed_total")).toBe(0);
  });
});

describe("notification worker metrics: processor wrapper", () => {
  it("tracks active jobs up and down, observes duration, and passes the result through", async () => {
    const { registry, instrumentation } = build();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const wrapped = instrumentation.wrapProcessor(async (_job: FakeJob) => {
      await gate;
    });

    const p1 = wrapped({ attemptsMade: 0, opts: {} });
    const p2 = wrapped({ attemptsMade: 0, opts: {} });
    expect(await value(registry, "woobe_notification_jobs_active")).toBe(2);

    await new Promise((r) => setTimeout(r, 20));
    release();
    await Promise.all([p1, p2]);

    expect(await value(registry, "woobe_notification_jobs_active")).toBe(0);
    const text = await registry.metrics();
    expect(text).toContain('woobe_notification_job_duration_seconds_count{result="success"} 2');
    expect(text).toContain('woobe_notification_job_duration_seconds_count{result="failure"} 0'); // pre-created, still zero
    const sumLine = text.split("\n").find((l) => l.startsWith('woobe_notification_job_duration_seconds_sum{result="success"}'))!;
    expect(Number(sumLine.split(" ")[1])).toBeGreaterThan(0.02);
  });

  it("rethrows the processor's error untouched (BullMQ's retry/backoff must still see it), records a failure duration and releases the active slot", async () => {
    const { registry, instrumentation } = build();
    const boom = new Error("smtp down");
    const wrapped = instrumentation.wrapProcessor(async (_job: FakeJob) => {
      throw boom;
    });

    await expect(wrapped({ attemptsMade: 0, opts: {} })).rejects.toBe(boom);
    expect(await value(registry, "woobe_notification_jobs_active")).toBe(0);
    expect(await registry.metrics()).toContain('woobe_notification_job_duration_seconds_count{result="failure"} 1');
    // The wrapper alone must not decide completed/terminal — that is BullMQ's event, once per outcome.
    expect(await value(registry, "woobe_notification_jobs_completed_total")).toBe(0);
    expect(await value(registry, "woobe_notification_jobs_failed_total")).toBe(0);
  });
});

describe("notification worker metrics: queue depth (scrape-time collect)", () => {
  it("reads the counts at scrape time, one series per state", async () => {
    const { registry } = build(async () => ({ waiting: 7, active: 2, delayed: 1, failed: 4 }));
    const text = await registry.metrics();
    for (const [state, n] of [["waiting", 7], ["active", 2], ["delayed", 1], ["failed", 4]] as const) {
      expect(text).toContain(`woobe_notification_queue_jobs{state="${state}"} ${n}`);
    }
  });

  it("reflects the CURRENT count on every scrape (no stale values)", async () => {
    let waiting = 3;
    const { registry } = build(async () => ({ waiting }));
    expect(await registry.metrics()).toContain('woobe_notification_queue_jobs{state="waiting"} 3');
    waiting = 0;
    expect(await registry.metrics()).toContain('woobe_notification_queue_jobs{state="waiting"} 0');
  });

  it("when Redis fails, the scrape still succeeds and the gauge is ABSENT (not a fake zero, not stale)", async () => {
    let fail = false;
    const { registry } = build(async () => {
      if (fail) throw new Error("ECONNREFUSED");
      return { waiting: 5 };
    });
    expect(await registry.metrics()).toContain('woobe_notification_queue_jobs{state="waiting"} 5');
    fail = true;
    const text = await registry.metrics();
    expect(text).not.toContain("woobe_notification_queue_jobs{");
    expect(text).toContain("woobe_notification_jobs_completed_total"); // the rest of the registry still serves
  });

  it("a hung Redis call cannot hang the scrape (bounded by a timeout)", async () => {
    const { registry } = build(() => new Promise<QueueCounts>(() => undefined));
    const started = Date.now();
    const text = await registry.metrics();
    expect(Date.now() - started).toBeLessThan(4000);
    expect(text).not.toContain("woobe_notification_queue_jobs{");
  }, 10_000);
});

describe("zero-initialised series", () => {
  it("terminal-failure and duration series exist at 0 from the start, so the first failure is visible to increase()", async () => {
    const { registry } = build();
    const text = await registry.metrics();
    expect(text).toContain('woobe_notification_jobs_failed_total{reason="unrecoverable"} 0');
    expect(text).toContain('woobe_notification_jobs_failed_total{reason="attempts_exhausted"} 0');
    expect(text).toContain('woobe_notification_job_duration_seconds_count{result="success"} 0');
  });
});

describe("worker registry", () => {
  it("exposes the official Node.js/process default metrics under the woobe_node_ prefix, on its own registry", async () => {
    const text = await createWorkerRegistry().metrics();
    for (const name of ["woobe_node_process_cpu_user_seconds_total", "woobe_node_process_resident_memory_bytes", "woobe_node_nodejs_heap_size_used_bytes", "woobe_node_nodejs_eventloop_lag_seconds", "woobe_node_nodejs_version_info"]) {
      expect(text, name).toContain(name);
    }
    expect(text).not.toContain("woobe_http_");
  });
});

describe("metrics server", () => {
  async function fetchText(port: number, path: string, method = "GET"): Promise<{ status: number; type: string | undefined; body: string }> {
    return new Promise((resolve, reject) => {
      const req = http.request({ host: "127.0.0.1", port, path, method }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, type: res.headers["content-type"], body }));
      });
      req.on("error", reject);
      req.end();
    });
  }

  it("serves only GET /metrics with the registry's content type, and 404s everything else", async () => {
    const registry = createWorkerRegistry();
    createNotificationWorkerMetrics(registry, async () => ({ waiting: 1 }));
    const server = await startMetricsServer({ registry, host: "127.0.0.1", port: 0 });
    const port = (server.address() as AddressInfo).port;
    try {
      const ok = await fetchText(port, "/metrics");
      expect(ok.status).toBe(200);
      expect(ok.type).toBe(registry.contentType);
      expect(ok.body).toContain("woobe_node_process_cpu_user_seconds_total");
      expect(ok.body).toContain('woobe_notification_queue_jobs{state="waiting"} 1');

      expect((await fetchText(port, "/metrics?x=1")).status).toBe(200);
      expect((await fetchText(port, "/")).status).toBe(404);
      expect((await fetchText(port, "/health")).status).toBe(404);
      expect((await fetchText(port, "/metrics", "POST")).status).toBe(404);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it("binds only the requested host (loopback), not every interface", async () => {
    const server = await startMetricsServer({ registry: new Registry(), host: "127.0.0.1", port: 0 });
    try {
      expect((server.address() as AddressInfo).address).toBe("127.0.0.1");
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it("rejects (rather than crashing the process) when the port is already taken, so the worker can log and carry on", async () => {
    const first = await startMetricsServer({ registry: new Registry(), host: "127.0.0.1", port: 0 });
    const taken = (first.address() as AddressInfo).port;
    try {
      await expect(startMetricsServer({ registry: new Registry(), host: "127.0.0.1", port: taken })).rejects.toThrow(/EADDRINUSE/);
    } finally {
      await new Promise<void>((r) => first.close(() => r()));
    }
  });
});
