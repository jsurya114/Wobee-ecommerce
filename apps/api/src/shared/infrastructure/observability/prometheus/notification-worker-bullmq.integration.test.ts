import { randomUUID } from "node:crypto";
import { Queue, UnrecoverableError, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { Registry } from "@prometheus-io/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { classifyFailedAttempt } from "../../../../modules/notifications/infrastructure/queues/classify-failed-attempt";
import { createNotificationWorkerMetrics, NotificationWorkerInstrumentation } from "./notification-worker-metrics";

/**
 * The real thing: a real BullMQ Queue + Worker on the test Redis (the same
 * one the rest of this package's integration tests use), wired exactly the
 * way worker.ts wires it (wrapProcessor + attach + getJobCounts at scrape
 * time). This is what proves "a retry is not a completion" against
 * BullMQ's actual event semantics rather than against a hand-rolled fake.
 * Uses a throwaway queue name and obliterates it afterwards.
 */
const queueName = `obs-test-${randomUUID().slice(0, 8)}`;
const connection = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
const queue = new Queue(queueName, { connection });
const registry = new Registry();
const metrics = createNotificationWorkerMetrics(registry, () => queue.getJobCounts("waiting", "active", "delayed", "failed"));
const instrumentation = new NotificationWorkerInstrumentation<Job, Error>(metrics, classifyFailedAttempt);

const attemptsSeen = new Map<string, number>();
let worker: Worker;

beforeAll(() => {
  worker = new Worker(
    queueName,
    instrumentation.wrapProcessor(async (job: Job<{ mode: "ok" | "flaky" | "always-fail" | "unrecoverable" }>) => {
      const n = (attemptsSeen.get(job.id!) ?? 0) + 1;
      attemptsSeen.set(job.id!, n);
      if (job.data.mode === "flaky" && n < 3) throw new Error("transient");
      if (job.data.mode === "always-fail") throw new Error("permanent-ish");
      if (job.data.mode === "unrecoverable") throw new UnrecoverableError("no contact email");
    }),
    { connection: connection.duplicate({ maxRetriesPerRequest: null }), concurrency: 5 },
  );
  instrumentation.attach(worker);
});

afterAll(async () => {
  await worker.close();
  await queue.obliterate({ force: true });
  await queue.close();
  connection.disconnect();
});

async function counter(name: string, labels: Record<string, string> = {}): Promise<number> {
  const all = await registry.getMetricsAsJSON();
  return ((all.find((m) => m.name === name)?.values ?? []) as { labels: Record<string, string>; value: number }[])
    .filter((v) => Object.entries(labels).every(([k, val]) => v.labels[k] === val))
    .reduce((s, v) => s + v.value, 0);
}

async function until(check: () => Promise<boolean>, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("timed out waiting for condition");
    await new Promise((r) => setTimeout(r, 50));
  }
}

const RETRY = { attempts: 3, backoff: { type: "fixed", delay: 50 }, removeOnComplete: true, removeOnFail: 100 } as const;

describe("BullMQ worker metrics (real Queue + Worker)", () => {
  it("a job that fails twice then succeeds is 2 attempt failures + 1 completion + 0 terminal failures", async () => {
    await queue.add("send", { mode: "flaky" }, { ...RETRY, jobId: "flaky-1" });
    await until(async () => (await counter("woobe_notification_jobs_completed_total")) >= 1);

    expect(await counter("woobe_notification_jobs_completed_total")).toBe(1);
    expect(await counter("woobe_notification_job_attempt_failures_total")).toBe(2);
    expect(await counter("woobe_notification_jobs_failed_total")).toBe(0);
    expect(attemptsSeen.get("flaky-1")).toBe(3);
  });

  it("a job that exhausts its attempts is exactly ONE terminal failure and never a completion", async () => {
    const completedBefore = await counter("woobe_notification_jobs_completed_total");
    const attemptFailuresBefore = await counter("woobe_notification_job_attempt_failures_total");

    await queue.add("send", { mode: "always-fail" }, { ...RETRY, jobId: "fail-1" });
    await until(async () => (await counter("woobe_notification_jobs_failed_total", { reason: "attempts_exhausted" })) >= 1);

    expect(await counter("woobe_notification_jobs_failed_total", { reason: "attempts_exhausted" })).toBe(1);
    expect(await counter("woobe_notification_job_attempt_failures_total")).toBe(attemptFailuresBefore + 3);
    expect(await counter("woobe_notification_jobs_completed_total")).toBe(completedBefore);
  });

  it("an UnrecoverableError is terminal after ONE attempt (BullMQ does not retry it)", async () => {
    await queue.add("send", { mode: "unrecoverable" }, { ...RETRY, jobId: "unrec-1" });
    await until(async () => (await counter("woobe_notification_jobs_failed_total", { reason: "unrecoverable" })) >= 1);

    expect(await counter("woobe_notification_jobs_failed_total", { reason: "unrecoverable" })).toBe(1);
    expect(attemptsSeen.get("unrec-1")).toBe(1);
  });

  it("a plain success completes once, and the active gauge and queue depth settle back down", async () => {
    const completedBefore = await counter("woobe_notification_jobs_completed_total");
    await queue.add("send", { mode: "ok" }, { ...RETRY, jobId: "ok-1" });
    await until(async () => (await counter("woobe_notification_jobs_completed_total")) >= completedBefore + 1);

    expect(await counter("woobe_notification_jobs_completed_total")).toBe(completedBefore + 1);
    await until(async () => (await counter("woobe_notification_jobs_active")) === 0);
    const text = await registry.metrics();
    expect(text).toContain('woobe_notification_queue_jobs{state="waiting"} 0');
    expect(text).toContain('woobe_notification_queue_jobs{state="active"} 0');
    expect(text).toMatch(/woobe_notification_queue_jobs\{state="failed"\} [12]/); // the two terminal failures above (removeOnFail keeps them)
  });

  it("queue depth reflects real backlog at scrape time: waiting/delayed jobs appear while no worker takes them", async () => {
    await worker.pause();
    await queue.add("send", { mode: "ok" }, { ...RETRY, jobId: "wait-1" });
    await queue.add("send", { mode: "ok" }, { ...RETRY, jobId: "wait-2" });
    await queue.add("send", { mode: "ok" }, { ...RETRY, jobId: "later-1", delay: 60_000 });

    const text = await registry.metrics();
    expect(text).toContain('woobe_notification_queue_jobs{state="waiting"} 2');
    expect(text).toContain('woobe_notification_queue_jobs{state="delayed"} 1');
    await worker.resume();
  });
});
