"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

/** Records the start of a browsing session once per tab session (the API dedupes, so re-mounts are harmless). Mounted once in Providers. */
export function SessionStartTracker() {
  useEffect(() => {
    trackEvent({ type: "SESSION_STARTED" });
  }, []);
  return null;
}

/** Records that this session viewed a product (once per product per session — the API dedupes). Rendered by the product page. */
export function ProductViewTracker({ productId }: { productId: string }) {
  useEffect(() => {
    trackEvent({ type: "PRODUCT_VIEWED", productId });
  }, [productId]);
  return null;
}

/** Records that this session reached checkout. Rendered by the checkout page. */
export function CheckoutStartedTracker() {
  useEffect(() => {
    trackEvent({ type: "CHECKOUT_STARTED" });
  }, []);
  return null;
}
