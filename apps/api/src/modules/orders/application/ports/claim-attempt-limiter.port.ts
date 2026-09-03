/**
 * Anti-abuse guard for ClaimGuestOrderUseCase (client-review fix,
 * 2026-09-03) — the claim endpoint takes an order number + email and
 * decides whether to attach an order to the caller's account, so without a
 * cap on tries it becomes a brute-force surface for the order number's
 * randomness (crypto-random — see OrderNumberGeneratorService — but still
 * worth bounding attempts, same "don't rely on entropy alone" posture
 * ADR-018's refresh-token reuse detection takes elsewhere). Unlike the OTP
 * attempt counters (Postgres-backed, ADR-017 — they must survive a
 * restart to mean anything), losing this on a Redis restart is harmless:
 * worst case the window just resets. ADR-017 explicitly names rate
 * limiting as one of Redis's reserved hot-path uses.
 */
export interface ClaimAttemptLimiterPort {
  /** Returns true if this attempt is allowed (and now counts against the caller's window); false once they've hit the cap. */
  allow(key: string): Promise<boolean>;
}
