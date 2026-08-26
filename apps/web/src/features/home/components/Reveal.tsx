"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/**
 * Scroll-reveal wrapper (woobe_ui_design_plan.md §11) — fade + slight
 * upward translate, once per section, not on every re-entry
 * (`viewport={{ once: true }}`). Respects `prefers-reduced-motion` via
 * Motion's own hook, per §11's explicit requirement — a one-line skip, not
 * an afterthought.
 */
export function Reveal({ children }: { children: ReactNode }) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return <>{children}</>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
