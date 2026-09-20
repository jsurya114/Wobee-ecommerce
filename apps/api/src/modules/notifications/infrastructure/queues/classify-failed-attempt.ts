/**
 * What one FAILED attempt of a BullMQ job means, decided in one place so the
 * worker's terminal-failure bookkeeping (`markNotificationFailedUseCase`) and
 * its metrics can never disagree about whether a failure was final.
 *
 *  - "retry":              BullMQ will run another attempt (backoff applies). Not a terminal failure.
 *  - "unrecoverable":      the processor threw BullMQ's UnrecoverableError — retrying can never help, BullMQ stops immediately.
 *  - "attempts_exhausted": this was the job's last allowed attempt.
 *
 * This is a verbatim extraction of the condition worker.ts's `failed`
 * handler already used (`attemptsMade >= (opts.attempts ?? 1)` OR the error
 * is an UnrecoverableError) — behavior is unchanged; only its name and
 * testability are new.
 */
export type FailedAttemptOutcome = "retry" | "unrecoverable" | "attempts_exhausted";

export function classifyFailedAttempt(
  job: { attemptsMade: number; opts: { attempts?: number } },
  error: { name: string },
): FailedAttemptOutcome {
  if (error.name === "UnrecoverableError") return "unrecoverable";
  if (job.attemptsMade >= (job.opts.attempts ?? 1)) return "attempts_exhausted";
  return "retry";
}
