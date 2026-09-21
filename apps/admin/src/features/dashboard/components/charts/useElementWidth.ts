"use client";

import { useEffect, useRef, useState } from "react";

/** Tracks an element's rendered width so SVG charts draw at real pixel size (crisp text, no stretched glyphs). Falls back to `initial` before the first measure / on the server. */
export function useElementWidth<T extends HTMLElement>(initial = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(Math.max(120, Math.round(el.getBoundingClientRect().width)));
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.max(120, Math.round(w)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}
