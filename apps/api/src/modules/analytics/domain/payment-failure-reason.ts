/**
 * Razorpay failure reasons arrive as free-form strings (`error_code`,
 * `error_reason`, `error_description`) and can change without notice. The UI
 * must never inherit that unbounded vocabulary, so every failure is mapped to
 * one of these keys — anything unrecognised becomes "unknown". Order matters:
 * the first matching rule wins, most specific first.
 */
export const PAYMENT_FAILURE_REASONS = [
  "insufficient_funds",
  "declined",
  "authentication_failed",
  "network_error",
  "timeout",
  "cancelled",
  "expired",
  "invalid_request",
  "unknown",
] as const;
export type PaymentFailureReason = (typeof PAYMENT_FAILURE_REASONS)[number];

export const PAYMENT_FAILURE_LABELS: Record<PaymentFailureReason, string> = {
  insufficient_funds: "Insufficient funds",
  declined: "Declined by bank / issuer",
  authentication_failed: "Authentication failed",
  network_error: "Network / gateway error",
  timeout: "Timed out",
  cancelled: "Cancelled by customer",
  expired: "Expired",
  invalid_request: "Invalid details",
  unknown: "Unknown / other",
};

const RULES: [PaymentFailureReason, RegExp][] = [
  ["insufficient_funds", /insufficient|not enough (funds|balance)|low balance/],
  ["authentication_failed", /authenticat|3ds|otp|incorrect[_ ]pin|invalid[_ ]pin|cvv|verification (failed|error)|authorization failed/],
  ["cancelled", /cancel|user[_ ]?(dropped|closed)|customer (closed|dismiss)/],
  ["timeout", /time[_ -]?out|timed[_ -]?out|too long/],
  ["expired", /expire/],
  ["declined", /declin|reject|denied|blocked|not permitted|do not honou?r|restricted|risk|fraud|limit exceeded/],
  ["network_error", /network|gateway|server[_ ]error|bank (is )?(down|unavailable)|unavailable|connectivity|technical/],
  ["invalid_request", /invalid|incorrect|input[_ ]validation|bad[_ ]request|not supported|malformed/],
];

export interface RawPaymentFailure {
  code?: string | null;
  reason?: string | null;
  description?: string | null;
}

export function normalizePaymentFailure(raw: RawPaymentFailure): PaymentFailureReason {
  const haystack = [raw.reason, raw.code, raw.description]
    .filter((part): part is string => typeof part === "string" && part.trim() !== "")
    .join(" | ")
    .toLowerCase();
  if (haystack === "") return "unknown";
  for (const [reason, pattern] of RULES) {
    if (pattern.test(haystack)) return reason;
  }
  return "unknown";
}
