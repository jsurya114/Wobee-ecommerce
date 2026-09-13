/**
 * Minimal structured logging — deliberately not a full logging library or a
 * new dependency. Every error-path log call in this codebase already only
 * fires on failure, never per successful request (confirmed by the
 * 2026-09-13 forensic review — there is no per-request access log anywhere),
 * so there's no log-volume/cost problem to solve here. The actual gap was
 * that those already-rare lines were interpolated strings, not queryable
 * fields — this makes them one-line JSON so a log aggregator (CloudWatch
 * Logs Insights or any JSON processor) can filter/group by `event`, `code`,
 * `requestId`, etc. instead of grepping message text.
 */
export function logError(event: string, fields: Record<string, unknown> = {}): void {
  console.error(JSON.stringify({ level: "error", event, time: new Date().toISOString(), ...fields }));
}
