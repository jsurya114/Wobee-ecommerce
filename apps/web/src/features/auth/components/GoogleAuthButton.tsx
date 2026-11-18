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

/** False when the client ID wasn't set at build time — the button renders nothing, so callers should drop any chrome (dividers) built around it too. */
export const IS_GOOGLE_AUTH_CONFIGURED = Boolean(GOOGLE_CLIENT_ID);

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
 * profile. Google's official button is rendered visibly and the user
 * clicks it directly.
 *
 * 2026-11-18 fix: this used to render GIS's button off-screen and proxy
 * our own button's click into its `div[role="button"]`. GIS now renders
 * the button inside a cross-origin iframe (FedCM-capable), so that div no
 * longer exists and can't be clicked from our page — "Continue with
 * Google" silently did nothing on the live site. Only a real user click
 * on Google's iframe can open the sign-in, so the official button is
 * shown as-is. Our styled button is kept only as the loading / busy
 * placeholder. The only thing ever sent to the backend is the opaque ID
 * token GIS hands back; the server is the sole authority on the profile.
 */
export function GoogleAuthButton() {
  const router = useRouter();
  const { authenticateWithGoogle } = useAuth();
  const [scriptReady, setScriptReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonContainerRef = useRef<HTMLDivElement>(null);
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
    const container = buttonContainerRef.current;
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
    // GIS takes a pixel width (200–400); match the form column so it lines up with the other fields.
    const width = Math.min(400, Math.max(200, Math.floor(wrapperRef.current?.clientWidth ?? 320)));
    google.accounts.id.renderButton(container, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "continue_with",
      shape: "rectangular",
      logo_alignment: "center",
      width,
    });
    initializedRef.current = true;
    setScriptReady(true);
  }, [handleCredential]);

  if (!IS_GOOGLE_AUTH_CONFIGURED) return null;

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
        // buttonContainerRef never gets initialize()/renderButton() called
        // on it, so scriptReady stays false and the button stays disabled
        // until a full page reload.
        onReady={handleScriptLoad}
      />
      <div ref={wrapperRef} className="relative w-full">
        {/* Google's official button. Laid out (visibility only) while loading so GIS can size it. */}
        <div
          ref={buttonContainerRef}
          className={`flex min-h-11 w-full justify-center ${scriptReady && !busy ? "" : "invisible absolute inset-0"}`}
        />
        {!scriptReady || busy ? (
          <Button type="button" variant="secondary" className="w-full" disabled isLoading={busy} aria-busy={busy}>
            <GoogleGlyph />
            {busy ? "Signing in…" : "Continue with Google"}
          </Button>
        ) : null}
      </div>
    </>
  );
}
