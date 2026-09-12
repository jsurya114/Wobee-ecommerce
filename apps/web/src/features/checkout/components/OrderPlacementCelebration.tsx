"use client";

import { CheckCircle2, Sparkle } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

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
const CELEBRATE_DURATION_MS = 700;
const HOLD_DURATION_MS = 320;
const REDUCED_MOTION_HOLD_MS = 650;

const CIRCLE_SIZE = 112;
const STROKE_WIDTH = 6;
const RADIUS = (CIRCLE_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type ParticleShape = "dot" | "spark" | "confetti";

interface ParticleDef {
  angleDeg: number;
  distance: number;
  size: number;
  delayMs: number;
  color: string;
  shape: ParticleShape;
  rotateDeg: number;
}

/**
 * Fixed (not `Math.random()`-per-render), hand-tuned launch angle/distance/
 * size/delay per particle — an uneven spread reads as a natural burst
 * rather than a mechanical ring, while staying restrained (14 particles,
 * per the "avoid excessive particles" requirement). Every color is an
 * existing brand token from `packages/config/tailwind/preset.cjs`
 * (`primary`/`primary.hover`/`primary.tint`) — never an invented hex, same
 * discipline as the 2026-09-12 toast-theme fix.
 */
const PARTICLES: ParticleDef[] = [
  { angleDeg: 8, distance: 58, size: 6, delayMs: 0, color: "#A54659", shape: "dot", rotateDeg: 0 },
  { angleDeg: 36, distance: 74, size: 8, delayMs: 40, color: "#F3DEE2", shape: "confetti", rotateDeg: 20 },
  { angleDeg: 64, distance: 50, size: 7, delayMs: 10, color: "#884350", shape: "dot", rotateDeg: 0 },
  { angleDeg: 92, distance: 80, size: 10, delayMs: 60, color: "#A54659", shape: "spark", rotateDeg: 0 },
  { angleDeg: 120, distance: 56, size: 5, delayMs: 20, color: "#F3DEE2", shape: "dot", rotateDeg: 0 },
  { angleDeg: 148, distance: 72, size: 8, delayMs: 50, color: "#884350", shape: "confetti", rotateDeg: -25 },
  { angleDeg: 176, distance: 62, size: 6, delayMs: 0, color: "#A54659", shape: "dot", rotateDeg: 0 },
  { angleDeg: 204, distance: 82, size: 10, delayMs: 30, color: "#F3DEE2", shape: "spark", rotateDeg: 0 },
  { angleDeg: 232, distance: 54, size: 5, delayMs: 70, color: "#A54659", shape: "dot", rotateDeg: 0 },
  { angleDeg: 260, distance: 76, size: 8, delayMs: 15, color: "#884350", shape: "confetti", rotateDeg: 40 },
  { angleDeg: 288, distance: 60, size: 6, delayMs: 45, color: "#F3DEE2", shape: "dot", rotateDeg: 0 },
  { angleDeg: 316, distance: 84, size: 9, delayMs: 5, color: "#A54659", shape: "spark", rotateDeg: 0 },
  { angleDeg: 344, distance: 66, size: 5, delayMs: 55, color: "#884350", shape: "dot", rotateDeg: 0 },
  { angleDeg: 20, distance: 44, size: 5, delayMs: 80, color: "#F3DEE2", shape: "dot", rotateDeg: 0 },
];

/**
 * Checkout's own order-placement transition (2026-09-12) — renders in
 * `CheckoutForm`'s existing `orderPlaced` branch, strictly *before*
 * navigating to `/order-confirmation/[id]`, which stays completely
 * untouched. Circle progress ring → brief completion pulse → a crackle of
 * particles bursting outward from inside the same circle → a checkmark +
 * "Order Placed!" → `onComplete` (which `CheckoutForm` uses to navigate).
 * Owns no checkout/business logic — it only receives a completion
 * callback, exactly like `OrderConfirmation`'s own `StatusHeading` owns no
 * payment logic despite animating its result.
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

  if (shouldReduceMotion) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center" role="status" aria-live="polite">
        <CheckCircle2 className="h-11 w-11 text-primary" strokeWidth={1.5} aria-hidden />
        <p className="font-display text-xl text-text-primary">Order Placed!</p>
        <p className="font-body text-sm text-text-secondary">Your order has been placed successfully.</p>
      </div>
    );
  }

  const isCelebrating = phase === "celebrate";

  return (
    <div className="flex flex-col items-center gap-5 py-16 text-center">
      <div className="relative flex h-28 w-28 items-center justify-center">
        <AnimatePresence mode="wait">
          {isCelebrating ? (
            <motion.div
              key="celebrate"
              className="relative flex h-full w-full items-center justify-center"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              {/* Particles launch from the exact center of the completed circle and expand outward — never a generic top-of-screen confetti drop. */}
              {PARTICLES.map((particle, index) => (
                <BurstParticle key={index} particle={particle} />
              ))}
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.05, ease: "easeOut" }}
              >
                <CheckCircle2 className="h-11 w-11 text-primary" strokeWidth={1.5} aria-hidden />
              </motion.div>
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
                <circle cx={CIRCLE_SIZE / 2} cy={CIRCLE_SIZE / 2} r={RADIUS} fill="none" stroke="#F3DEE2" strokeWidth={STROKE_WIDTH} />
                {/* Rotated -90deg so the progress line begins at the top (12 o'clock) — a defined, consistent start point. */}
                <motion.circle
                  cx={CIRCLE_SIZE / 2}
                  cy={CIRCLE_SIZE / 2}
                  r={RADIUS}
                  fill="none"
                  stroke="#A54659"
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

      <div role="status" aria-live="polite" className="flex flex-col items-center gap-1">
        <AnimatePresence mode="wait">
          {isCelebrating ? (
            <motion.div
              key="celebrate-text"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.1, ease: "easeOut" }}
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

function BurstParticle({ particle }: { particle: ParticleDef }) {
  const radians = (particle.angleDeg * Math.PI) / 180;
  const targetX = Math.cos(radians) * particle.distance;
  const targetY = Math.sin(radians) * particle.distance;

  const shared = {
    initial: { x: 0, y: 0, opacity: 0, scale: 0 },
    animate: { x: targetX, y: targetY, opacity: [0, 1, 1, 0], scale: [0, 1, 1, 0.7] },
    transition: {
      duration: CELEBRATE_DURATION_MS / 1000,
      delay: particle.delayMs / 1000,
      // Fast off the center, decelerating outward — a real burst, not a linear slide.
      ease: "easeOut" as const,
    },
  };

  if (particle.shape === "spark") {
    return (
      <motion.span className="absolute" style={{ left: "50%", top: "50%", marginLeft: -particle.size / 2, marginTop: -particle.size / 2 }} {...shared}>
        <Sparkle size={particle.size * 2} color={particle.color} fill={particle.color} strokeWidth={0} aria-hidden />
      </motion.span>
    );
  }

  const isConfetti = particle.shape === "confetti";
  return (
    <motion.span
      className="absolute"
      style={{
        left: "50%",
        top: "50%",
        marginLeft: -particle.size / 2,
        marginTop: -particle.size / 2,
        width: isConfetti ? particle.size * 1.6 : particle.size,
        height: isConfetti ? particle.size * 0.9 : particle.size,
        backgroundColor: particle.color,
        borderRadius: isConfetti ? 2 : "9999px",
        rotate: particle.rotateDeg,
      }}
      {...shared}
    />
  );
}
