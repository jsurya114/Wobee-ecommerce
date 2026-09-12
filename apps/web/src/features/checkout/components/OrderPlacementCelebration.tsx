"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Options as ConfettiOptions } from "canvas-confetti";

type Phase = "progress" | "pulse" | "celebrate";

/**
 * Named, short, fixed timing constants — same "self-documenting timer"
 * convention `OrderConfirmation.tsx` already uses for its own poll timers
 * (`POLL_INTERVAL_MS`/`POLL_TIMEOUT_MS`). Nothing here is a real wait: by
 * the time this component ever mounts, `CheckoutForm`'s `onSubmit` has
 * already awaited a successful `checkoutApi.checkout()` call — this is
 * purely the celebratory beat between "order placed" and navigating to the
 * (untouched) confirmation page, so the total is kept short and fixed
 * rather than tied to any network wait.
 */
const PROGRESS_DURATION_MS = 900;
const PULSE_DURATION_MS = 220;
const CELEBRATE_DURATION_MS = 950;
const HOLD_DURATION_MS = 450;
const REDUCED_MOTION_HOLD_MS = 650;

const CIRCLE_SIZE = 112;
const STROKE_WIDTH = 6;
const RADIUS = (CIRCLE_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Woobe's own brand tokens (`packages/config/tailwind/preset.cjs`) — the only colors the confetti/badge ever use. Never an invented hex. */
const BRAND_PRIMARY = "#A54659";
const BRAND_PRIMARY_HOVER = "#884350";
const BRAND_PRIMARY_TINT = "#F3DEE2";

/**
 * Fixed (not randomized per render) sparkle positions around the "Hooray!"
 * badge, each on its own staggered pulse loop.
 */
const SPARKLE_POSITIONS: { top?: string; left?: string; right?: string; bottom?: string; delayS: number }[] = [
  { top: "-6px", left: "14%", delayS: 0 },
  { top: "6px", right: "-4px", delayS: 0.35 },
  { bottom: "-4px", right: "22%", delayS: 0.7 },
];

/**
 * Fires the full-page confetti burst once, dynamically importing
 * `canvas-confetti` (browser-only — a static import would run at module
 * scope, which SSR can't evaluate) so this component stays server-render
 * safe. Five staggered bursts with varying spread/velocity/decay, same
 * shape as the reference "pop party" implementation this was modeled on
 * (github.com/jsurya114/CycloneX, `Apps/views/user/confirmation.ejs`) —
 * recolored to Woobe's own pink family instead of that reference's
 * rainbow palette, per this app's single-brand-color design system.
 */
function fireConfetti(): void {
  void import("canvas-confetti").then(({ default: confetti }) => {
    const colors = [BRAND_PRIMARY, BRAND_PRIMARY_HOVER, BRAND_PRIMARY_TINT];
    const count = 160;
    const defaults: ConfettiOptions = { origin: { y: 0.7 }, zIndex: 60, colors };
    const fire = (particleRatio: number, opts: ConfettiOptions) =>
      confetti({ ...defaults, ...opts, particleCount: Math.floor(count * particleRatio) });

    fire(0.25, { spread: 26, startVelocity: 55 });
    fire(0.2, { spread: 60 });
    fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
    fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
    fire(0.1, { spread: 120, startVelocity: 45 });
  });
}

/**
 * Checkout's own order-placement transition (2026-09-12, redesigned the
 * same day after the "pop party" reference) — renders in `CheckoutForm`'s
 * existing `orderPlaced` branch, strictly *before* navigating to
 * `/order-confirmation/[id]`, which stays completely untouched. Circle
 * progress ring → brief completion pulse → a draw-in checkmark with a
 * bouncy "Hooray!" badge and a full-page confetti burst → `onComplete`
 * (which `CheckoutForm` uses to navigate). Owns no checkout/business
 * logic — it only receives a completion callback, exactly like
 * `OrderConfirmation`'s own `StatusHeading` owns no payment logic despite
 * animating its result.
 */
export function OrderPlacementCelebration({ onComplete }: { onComplete: () => void }) {
  const shouldReduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("progress");

  // Read via ref so the timer effect below runs exactly once per mount
  // regardless of the caller's own re-renders — this sequence must not
  // restart or double-fire `onComplete` just because `CheckoutForm`
  // re-rendered for an unrelated reason (e.g. the cart-refresh state it
  // manages elsewhere).
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (shouldReduceMotion) {
      const holdTimer = setTimeout(() => onCompleteRef.current(), REDUCED_MOTION_HOLD_MS);
      return () => clearTimeout(holdTimer);
    }
    const pulseTimer = setTimeout(() => setPhase("pulse"), PROGRESS_DURATION_MS);
    const celebrateTimer = setTimeout(() => setPhase("celebrate"), PROGRESS_DURATION_MS + PULSE_DURATION_MS);
    const completeTimer = setTimeout(
      () => onCompleteRef.current(),
      PROGRESS_DURATION_MS + PULSE_DURATION_MS + CELEBRATE_DURATION_MS + HOLD_DURATION_MS,
    );
    return () => {
      clearTimeout(pulseTimer);
      clearTimeout(celebrateTimer);
      clearTimeout(completeTimer);
    };
    // `onComplete` itself is intentionally not a dep — it's read via the ref
    // above so this timer chain runs exactly once per mount, not once per
    // render of whatever inline callback the caller passed in.
  }, [shouldReduceMotion]);

  // Confetti is a real DOM side effect (a canvas appended to <body>), not a
  // Motion animation — fired imperatively, once, the instant the celebrate
  // phase begins. Guarded by a ref (not just the phase check) so React 18
  // dev-mode's mount→cleanup→remount never fires it twice. Skipped
  // entirely under reduced motion, per the task's own accessibility
  // requirement — a full-page particle burst is exactly the kind of
  // "elaborate" effect that rule exists to avoid.
  const confettiFiredRef = useRef(false);
  useEffect(() => {
    if (shouldReduceMotion || phase !== "celebrate" || confettiFiredRef.current) return;
    confettiFiredRef.current = true;
    fireConfetti();
  }, [phase, shouldReduceMotion]);

  if (shouldReduceMotion) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center" role="status" aria-live="polite">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-lg">
          <CheckmarkIcon className="h-9 w-9" strokeColor={BRAND_PRIMARY} animate={false} />
        </div>
        <p className="font-display text-xl text-text-primary">Order Placed!</p>
        <p className="font-body text-sm text-text-secondary">Your order has been placed successfully.</p>
      </div>
    );
  }

  const isCelebrating = phase === "celebrate";

  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <div className="relative flex h-28 w-28 items-center justify-center">
        <AnimatePresence mode="wait">
          {isCelebrating ? (
            <motion.div
              key="celebrate"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-lg"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 320, damping: 14 }}
            >
              <CheckmarkIcon className="h-9 w-9" strokeColor={BRAND_PRIMARY} animate />
            </motion.div>
          ) : (
            <motion.div
              key="ring"
              className="flex h-full w-full items-center justify-center"
              animate={{
                scale: phase === "pulse" ? 1.06 : 1,
                filter: phase === "pulse" ? "drop-shadow(0 0 14px rgba(165,70,89,0.45))" : "drop-shadow(0 0 0 rgba(165,70,89,0))",
              }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: phase === "pulse" ? PULSE_DURATION_MS / 1000 : 0.2, ease: "easeOut" }}
            >
              <svg width={CIRCLE_SIZE} height={CIRCLE_SIZE} viewBox={`0 0 ${CIRCLE_SIZE} ${CIRCLE_SIZE}`} aria-hidden>
                <circle cx={CIRCLE_SIZE / 2} cy={CIRCLE_SIZE / 2} r={RADIUS} fill="none" stroke={BRAND_PRIMARY_TINT} strokeWidth={STROKE_WIDTH} />
                {/* Rotated -90deg so the progress line begins at the top (12 o'clock) — a defined, consistent start point. */}
                <motion.circle
                  cx={CIRCLE_SIZE / 2}
                  cy={CIRCLE_SIZE / 2}
                  r={RADIUS}
                  fill="none"
                  stroke={BRAND_PRIMARY}
                  strokeWidth={STROKE_WIDTH}
                  strokeLinecap="round"
                  strokeDasharray={CIRCUMFERENCE}
                  initial={{ strokeDashoffset: CIRCUMFERENCE }}
                  animate={{ strokeDashoffset: 0 }}
                  transition={{ duration: PROGRESS_DURATION_MS / 1000, ease: [0.16, 1, 0.3, 1] }}
                  transform={`rotate(-90 ${CIRCLE_SIZE / 2} ${CIRCLE_SIZE / 2})`}
                />
              </svg>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* The "Hooray!" badge — bounces in shortly after the checkmark draws, then floats gently with a few pulsing sparkles, same beats as the reference this was modeled on, restyled in Woobe's own pink gradient. */}
      <AnimatePresence>
        {isCelebrating ? (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 12, delay: 0.5 }}
          >
            <motion.div
              className="relative inline-flex items-center rounded-pill px-4 py-1 font-body text-xs font-bold text-white shadow-card"
              style={{ background: `linear-gradient(to right, ${BRAND_PRIMARY}, ${BRAND_PRIMARY_HOVER})` }}
              animate={{ y: [0, -3, 0, -2, 0], rotate: [0, -2, 0, 2, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: 0.9 }}
            >
              Hooray!
              {SPARKLE_POSITIONS.map((pos, index) => (
                <motion.span
                  key={index}
                  className="absolute h-1.5 w-1.5 rounded-full bg-white"
                  style={{ top: pos.top, left: pos.left, right: pos.right, bottom: pos.bottom }}
                  animate={{ scale: [0, 1, 0.5, 1.1, 0], opacity: [0, 1, 0.5, 0.8, 0] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut", delay: 0.9 + pos.delayS }}
                />
              ))}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div role="status" aria-live="polite" className="flex flex-col items-center gap-1">
        <AnimatePresence mode="wait">
          {isCelebrating ? (
            <motion.div
              key="celebrate-text"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.2, ease: "easeOut" }}
              className="flex flex-col items-center gap-1"
            >
              <p className="font-display text-xl text-text-primary">Order Placed!</p>
              <p className="font-body text-sm text-text-secondary">Your order has been placed successfully.</p>
            </motion.div>
          ) : (
            <motion.div
              key="progress-text"
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col items-center gap-1"
            >
              <p className="font-body text-sm font-medium text-text-primary">Placing your order…</p>
              <p className="font-body text-xs text-text-secondary">Please wait a moment</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * The checkmark itself, drawn stroke-first (circle border, then the tick)
 * via Motion's `pathLength` — the declarative equivalent of the reference's
 * hand-written `stroke-dasharray`/`stroke-dashoffset` CSS keyframes, kept
 * consistent with how the progress ring above already animates its own
 * stroke. `animate={false}` renders the finished state instantly, used only
 * by the reduced-motion branch.
 */
function CheckmarkIcon({ className, strokeColor, animate }: { className?: string; strokeColor: string; animate: boolean }) {
  if (!animate) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx={12} cy={12} r={10.5} stroke={strokeColor} strokeWidth={1.5} />
        <path d="M7 12.5l3.2 3.2L17 9" stroke={strokeColor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <motion.svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <motion.circle
        cx={12}
        cy={12}
        r={10.5}
        stroke={strokeColor}
        strokeWidth={1.5}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.45, ease: [0.65, 0, 0.45, 1] }}
      />
      <motion.path
        d="M7 12.5l3.2 3.2L17 9"
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.25, delay: 0.4, ease: [0.65, 0, 0.45, 1] }}
      />
    </motion.svg>
  );
}
