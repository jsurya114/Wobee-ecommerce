"use client";

import { colors } from "@woobe/ui";

/**
 * Razorpay Checkout on the client (week1_excecution_prompt.md Day 5) —
 * loads Razorpay's hosted widget script and opens it. Deliberately does
 * NOT confirm anything on success: `handler`'s callback is the client
 * redirect ADR-014 says never to trust alone. It only resolves this
 * promise so the caller can move to a "confirming your payment…" state
 * and poll the order — only the webhook-verified capture (apps/api) ever
 * flips `Order.status` to CONFIRMED.
 */

interface RazorpayInstance {
  open(): void;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description?: string;
  handler: (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => void;
  modal?: { ondismiss?: () => void };
  theme?: { color?: string };
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

const CHECKOUT_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

let scriptLoadPromise: Promise<void> | null = null;

function loadRazorpayScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Razorpay Checkout can only load in the browser"));
  }
  if (window.Razorpay) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay Checkout — check your connection and try again"));
    document.body.appendChild(script);
  });
  return scriptLoadPromise;
}

export async function openRazorpayCheckout(config: {
  keyId: string;
  razorpayOrderId: string;
  amountPaise: number;
  currency: string;
  orderNumber: string;
}): Promise<void> {
  await loadRazorpayScript();
  const RazorpayCtor = window.Razorpay;
  if (!RazorpayCtor) {
    throw new Error("Razorpay Checkout failed to load");
  }

  return new Promise((resolve, reject) => {
    const instance = new RazorpayCtor({
      key: config.keyId,
      amount: config.amountPaise,
      currency: config.currency,
      order_id: config.razorpayOrderId,
      name: "Woobe",
      description: `Order ${config.orderNumber}`,
      handler: () => resolve(),
      modal: { ondismiss: () => reject(new Error("Payment cancelled")) },
      theme: { color: colors.brand.primary },
    });
    instance.open();
  });
}
