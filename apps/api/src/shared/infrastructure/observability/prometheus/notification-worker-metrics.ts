import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from "@prometheus-io/client";
import { logError } from "../../../logger";

/**
 * Metrics for the notification worker (worker.ts) — a SEPARATE Node.js
 * process from the API, so it owns its own Registry: in-memory counters
 * cannot cross a process boundary, and Prometheus scrapes it as its own
 * target (`job="woobe-worker"`) from its own loopback metrics server (see
 * metrics-server.ts). The default Node.js metrics use the same `woobe_node_`
 * prefix as the API — the `job` label, not a different name, is what tells
 * API and worker processes apart, so one Grafana panel works for both.
 *
 * Retry semantics (the part that is easy to get wrong):
 *  - `notification_jobs_completed_total` — exactly once per job, from BullMQ's
 *    `completed` event; a retry that later succeeds counts once, a failed
 *    attempt never counts.
 *  - `notification_job_attempt_failures_total` — every failed ATTEMPT,
 *    including ones BullMQ will retry. A rising rate here with a flat
 *    `notification_jobs_failed_total` means "flaky but recovering".
 *  - `notification_jobs_failed_total{reason}` — TERMINAL failures only (the
 *    job will not run again): the alert-worthy one.
 *  - `notification_job_duration_seconds{result}` — per ATTEMPT wall time.
 *
 * Labels are closed sets: `result` in {success,failure}, `reason` in
 * {unrecoverable,attempts_exhausted}, `state` in {waiting,active,delayed,failed}.
 * Nothing here accepts a notification id, recipient, or error message.
 */

/** Notification sends are bounded to ~15s worst case (nodemailer-mailer.ts), so the tail buckets go to 30s rather than reusing the HTTP set's 10s cap. */
export const NOTIFICATION_JOB_DURATION_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 15, 30];

export const QUEUE_STATES = ["waiting", "active", "delayed", "failed"] as const;
export type QueueState = (typeof QUEUE_STATES)[number];
export type QueueCounts = Partial<Record<QueueState, number>>;

/** Redis being slow/unreachable must degrade the queue-depth gauges, not hang the scrape (and so make a healthy worker look DOWN). */
const QUEUE_COUNT_TIMEOUT_MS = 2000;

export interface NotificationWorkerMetrics {
  jobsCompletedTotal: Counter<never>;
  jobAttemptFailuresTotal: Counter<never>;
  jobsFailedTotal: Counter<"reason">;
  jobDurationSeconds: Histogram<"result">;
  jobsActive: Gauge<never>;
  queueJobs: Gauge<"state">;
}

export function createNotificationWorkerMetrics(register: Registry, getQueueCounts: () => Promise<QueueCounts>): NotificationWorkerMetrics {
  const metrics: NotificationWorkerMetrics = {
    jobsCompletedTotal: new Counter({
      name: "woobe_notification_jobs_completed_total",
      help: "Notification jobs that completed successfully (counted once per job, never per attempt).",
      registers: [register],
    }),
    jobAttemptFailuresTotal: new Counter({
      name: "woobe_notification_job_attempt_failures_total",
      help: "Failed notification job ATTEMPTS, including ones BullMQ will retry (not terminal failures).",
      registers: [register],
    }),
    jobsFailedTotal: new Counter({
      name: "woobe_notification_jobs_failed_total",
      help: "Notification jobs that failed terminally and will not be retried, by reason.",
      labelNames: ["reason"],
      registers: [register],
    }),
    jobDurationSeconds: new Histogram({
      name: "woobe_notification_job_duration_seconds",
      help: "Wall-clock duration of one notification job attempt, by attempt result.",
      labelNames: ["result"],
      buckets: NOTIFICATION_JOB_DURATION_BUCKETS,
      registers: [register],
    }),
    jobsActive: new Gauge({
      name: "woobe_notification_jobs_active",
      help: "Notification jobs this worker process is executing right now (bounded by worker concurrency).",
      registers: [register],
    }),
    queueJobs: new Gauge({
      name: "woobe_notification_queue_jobs",
      help: "Jobs in the notification queue by BullMQ state, read from Redis at scrape time (one small count call per scrape). 'failed' is capped by removeOnFail (1000).",
      labelNames: ["state"],
      registers: [register],
      async collect() {
        this.reset();
        try {
          const counts = await withTimeout(getQueueCounts(), QUEUE_COUNT_TIMEOUT_MS);
          for (const state of QUEUE_STATES) {
            this.set({ state }, counts[state] ?? 0);
          }
        } catch (err) {
          // Leave the series absent (reset above) rather than serve a stale or fake zero.
          logError("notification_queue_count_failed", { message: err instanceof Error ? err.message : String(err) });
        }
      },
    }),
  };

  // Pre-create the bounded series at 0 so rate()/increase() see the very first failure
  // (a labelled counter that first appears already at 1 has no earlier sample to diff against).
  for (const reason of ["unrecoverable", "attempts_exhausted"] as const) metrics.jobsFailedTotal.inc({ reason }, 0);
  for (const result of ["success", "failure"] as const) metrics.jobDurationSeconds.zero({ result });
  return metrics;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** A fresh Registry with the official Node.js/process defaults — the worker process's own, never the API's. */
export function createWorkerRegistry(): Registry {
  const register = new Registry();
  collectDefaultMetrics({ register, prefix: "woobe_node_" });
  return register;
}

type FailedAttemptOutcome = "retry" | "unrecoverable" | "attempts_exhausted";

interface WorkerLike<TJob, TError> {
  on(event: "completed", listener: (job: TJob) => void): unknown;
  on(event: "failed", listener: (job: TJob | undefined, error: TError) => void): unknown;
}

export class NotificationWorkerInstrumentation<TJob, TError> {
  constructor(
    private readonly m: NotificationWorkerMetrics,
    private readonly classify: (job: TJob, error: TError) => FailedAttemptOutcome,
  ) {}

  /** Wraps the BullMQ processor: times each attempt and tracks in-process concurrency. Errors are rethrown untouched so BullMQ's own retry/backoff still runs. */
  wrapProcessor<TArgs extends unknown[]>(processor: (...args: TArgs) => Promise<void>): (...args: TArgs) => Promise<void> {
    return async (...args: TArgs) => {
      this.safely(() => this.m.jobsActive.inc());
      const startedAt = process.hrtime.bigint();
      let result: "success" | "failure" = "failure";
      try {
        await processor(...args);
        result = "success";
      } finally {
        const seconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
        this.safely(() => {
          this.m.jobDurationSeconds.observe({ result }, seconds);
          this.m.jobsActive.dec();
        });
      }
    };
  }

  /** Wires `completed`/`failed` — the only two BullMQ events that mean "this job is done" / "this attempt failed". */
  attach(worker: WorkerLike<TJob, TError>): void {
    worker.on("completed", () => {
      this.safely(() => this.m.jobsCompletedTotal.inc());
    });
    worker.on("failed", (job, error) => {
      this.safely(() => {
        this.m.jobAttemptFailuresTotal.inc();
        if (!job) return; // job already removed — an attempt failure is all we can attribute
        const outcome = this.classify(job, error);
        if (outcome !== "retry") this.m.jobsFailedTotal.inc({ reason: outcome });
      });
    });
  }

  private safely(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      logError("observability_metric_write_failed", { message: err instanceof Error ? err.message : String(err) });
    }
  }
}
