"use client";

import { useState } from "react";

/**
 * Footer newsletter capture. No backend yet — validates the address and
 * shows an inline confirmation so the footer reads like a real storefront's.
 * Wire the POST when the marketing list exists.
 */
export function NewsletterSignup() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <p className="font-body text-sm text-text-secondary" role="status">
        Thanks — you&apos;re on the list.
      </p>
    );
  }

  return (
    <form
      className="flex max-w-sm gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (email.trim()) setDone(true);
      }}
    >
      <label htmlFor="newsletter-email" className="sr-only">
        Email address
      </label>
      <input
        id="newsletter-email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Your email"
        className="min-w-0 flex-1 rounded-control border border-border bg-surface px-3 py-2 font-body text-sm text-text-primary outline-none placeholder:text-text-secondary focus:border-primary"
      />
      <button
        type="submit"
        className="shrink-0 rounded-control bg-primary px-4 py-2 font-body text-sm font-medium text-white transition-colors hover:bg-primary-hover"
      >
        Subscribe
      </button>
    </form>
  );
}
