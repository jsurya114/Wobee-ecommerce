"use client";

import { Button } from "@woobe/ui";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "../hooks/useAuth";
import { GoogleGlyph } from "./SocialAuthButtons";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleIdErrorResponse {
  type?: string;
  message?: string;
}

interface GoogleIdConfiguration {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  ux_mode?: "popup" | "redirect";
  error_callback?: (error: GoogleIdErrorResponse) => void;
}

interface GoogleAccountsId {
  initialize: (config: GoogleIdConfiguration) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

/**
 * "Continue with Google" — uses Google's own Identity Services (GIS)
 * client library, never a hand-rolled OAuth redirect or a fabricated
 * profile. GIS's real button is rendered into an off-screen container
 * (kept genuinely clickable, not display:none — GIS won't reliably open
 * its popup from an element that never lays out) and our own
 * visibly-styled button proxies its click there, so the actual
 * user-initiated click still lands on Google's real UI while the visual
 * matches the rest of the app. The only thing ever sent to the backend is
 * the opaque ID token GIS hands back — never email/name/picture assembled
 * client-side; the server is the sole authority on those.
 */
export function GoogleAuthButton() {
  const router = useRouter();
  const { authenticateWithGoogle } = useAuth();
  const [scriptReady, setScriptReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const hiddenContainerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  const handleCredential = useCallback(
    async (response: GoogleCredentialResponse) => {
      setBusy(true);
      try {
        const isNewUser = await authenticateWithGoogle(response.credential);
        toast.success(isNewUser ? "Welcome to Woobe!" : "Welcome back!");
        router.push("/");
      } catch (error) {
        if (error instanceof ApiError) {
          switch (error.code) {
            case "SERVICE_UNAVAILABLE":
              toast.error("Google sign-in isn't available right now.");
              break;
            case "UNAUTHORIZED":
              toast.error("Google sign-in failed. Please try again.");
              break;
            case "FORBIDDEN":
            case "CONFLICT":
            case "TOO_MANY_REQUESTS":
              // Server-crafted, user-actionable, non-enumerating copy —
              // used verbatim rather than paraphrased.
              toast.error(error.message);
              break;
            default:
              toast.error("Something went wrong. Please try again.");
          }
        } else {
          toast.error("Something went wrong. Please try again.");
        }
      } finally {
        setBusy(false);
      }
    },
    [authenticateWithGoogle, router],
  );

  const handleScriptLoad = useCallback(() => {
    if (!GOOGLE_CLIENT_ID || initializedRef.current) return;
    const google = window.google;
    const container = hiddenContainerRef.current;
    if (!google || !container) return;

    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      ux_mode: "popup",
      callback: (response) => {
        void handleCredential(response);
      },
      // GIS itself failing to open/complete (e.g. a blocked popup) — the
      // user simply closing the popup without choosing an account does
      // NOT reach this callback and does NOT reach ours either, so it's
      // correctly silent (no error, no stuck loading state).
      error_callback: () => {
        toast.error("Something went wrong. Please try again.");
      },
    });
    google.accounts.id.renderButton(container, {
      type: "standard",
      theme: "outline",
      size: "large",
    });
    initializedRef.current = true;
    setScriptReady(true);
  }, [handleCredential]);

  const handleClick = useCallback(() => {
    if (busy || !scriptReady) return;
    const realButton = hiddenContainerRef.current?.querySelector<HTMLElement>(
      'div[role="button"]',
    );
    realButton?.click();
  }, [busy, scriptReady]);

  if (!GOOGLE_CLIENT_ID) return null;

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        // onReady, not onLoad: GoogleAuthButton only lives on /login and
        // /register, so it unmounts on navigation and remounts on the way
        // back (e.g. after logout). The GIS script itself only loads once
        // per page lifetime — next/script's `onLoad` fires just for that
        // first network load and is NOT re-fired for a later remount, but
        // `onReady` is — it fires on every mount, immediately if the
        // script is already loaded. Without this, a remount's fresh
        // hiddenContainerRef never gets initialize()/renderButton() called
        // on it, so scriptReady stays false and the button stays disabled
        // until a full page reload.
        onReady={handleScriptLoad}
      />
      {/*
        Google's real, official button — kept in the DOM and clickable
        (never display:none) but visually and interactively out of the
        way: absolutely positioned off-screen, pinned to a tiny box, and
        pointer-events disabled on the wrapper only. Our visible button
        below dispatches a real click into it programmatically.
      */}
      <div
        ref={hiddenContainerRef}
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "-9999px",
          left: "-9999px",
          width: "1px",
          height: "1px",
          overflow: "hidden",
          pointerEvents: "none",
        }}
      />
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        onClick={handleClick}
        disabled={!scriptReady || busy}
        isLoading={busy}
        aria-label="Continue with Google"
        aria-busy={busy}
      >
        <GoogleGlyph />
        {busy ? "Signing in…" : "Continue with Google"}
      </Button>
    </>
  );
}
