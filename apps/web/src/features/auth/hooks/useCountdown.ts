"use client";

import { useCallback, useEffect, useState } from "react";

function secondsUntil(target: number | null): number {
  if (target === null) return 0;
  return Math.max(0, Math.ceil((target - Date.now()) / 1000));
}

/**
 * Whole-seconds countdown to an epoch-ms target (`null` = idle). One
 * `setInterval(1s)`, torn down on unmount / when it hits 0 / when the
 * target changes — same shape as `useGuestLoginPrompt`. `reset(next)` swaps
 * the target (used after "Resend code"). Drives the resend cooldown button
 * and the "expires in m:ss" line.
 */
export function useCountdown(target: number | null): {
  secondsLeft: number;
  reset: (next: number | null) => void;
} {
  const [current, setCurrent] = useState<number | null>(target);
  const [secondsLeft, setSecondsLeft] = useState(() => secondsUntil(target));

  // Follow the prop unless a `reset` has taken over.
  useEffect(() => {
    setCurrent(target);
  }, [target]);

  useEffect(() => {
    setSecondsLeft(secondsUntil(current));
    if (current === null) return;

    const id = window.setInterval(() => {
      const left = secondsUntil(current);
      setSecondsLeft(left);
      if (left === 0) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [current]);

  const reset = useCallback((next: number | null) => setCurrent(next), []);

  return { secondsLeft, reset };
}
