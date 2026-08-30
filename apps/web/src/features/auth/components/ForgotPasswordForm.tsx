"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  forgotPasswordSchema,
  OTP_CODE_LENGTH,
  resetPasswordFormSchema,
  type ForgotPasswordInput,
  type ResetPasswordFormValues,
} from "@woobe/validation";
import { Button } from "@woobe/ui";
import { Lock, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import * as authApi from "../api/auth.client";
import { useCountdown } from "../hooks/useCountdown";
import { AuthField } from "./AuthField";
import { OtpInput, type OtpInputHandle } from "./OtpInput";

type Step = "email" | "otp" | "password";

interface Challenge {
  email: string;
  expiresAt: number;
  resendAvailableAt: number;
}

function mmss(totalSeconds: number): string {
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

/**
 * Three-step, email-OTP forgot-password:
 *   1. "email"    — ask for the account email, call `/forgot-password`
 *                   (reveals nothing about whether that email exists).
 *   2. "otp"      — enter the emailed code; `/reset-password/verify` confirms
 *                   it's correct WITHOUT consuming it.
 *   3. "password" — a dedicated screen (only shown once the code checks out)
 *                   for the new password + a confirmation field.
 * The final `/reset-password` call carries the same verified code. On
 * success every session is revoked server-side and the user is sent to
 * `/login`; this flow never creates a session, so `useAuth` is untouched.
 */
export function ForgotPasswordForm() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("email");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const otpRef = useRef<OtpInputHandle>(null);

  const emailForm = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
  });
  const passwordForm = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordFormSchema),
  });

  const resend = useCountdown(challenge?.resendAvailableAt ?? null);
  const expiry = useCountdown(challenge?.expiresAt ?? null);

  function applyChallenge(res: authApi.OtpChallenge, email: string) {
    const next = {
      email,
      expiresAt: Date.parse(res.expiresAt),
      resendAvailableAt: Date.parse(res.resendAvailableAt),
    };
    setChallenge(next);
    resend.reset(next.resendAvailableAt);
    expiry.reset(next.expiresAt);
    setCode("");
    setOtpError(null);
    if (res.devCode) toast.info(`Dev code: ${res.devCode}`);
  }

  const onRequest = emailForm.handleSubmit(async (data) => {
    try {
      const res = await authApi.requestPasswordReset(data);
      applyChallenge(res, data.email);
      passwordForm.reset();
      setStep("otp");
      toast.success("If an account exists for that email, we've sent a reset code.");
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.fieldErrors?.email?.[0]) {
          emailForm.setError("email", { message: error.fieldErrors.email[0] });
          return;
        }
        toast.error(error.message);
        return;
      }
      toast.error("Something went wrong. Please try again.");
    }
  });

  async function submitVerify(next: string = code) {
    if (!challenge || next.length !== OTP_CODE_LENGTH || verifying) return;
    setVerifying(true);
    setOtpError(null);
    try {
      await authApi.verifyPasswordResetOtp({ email: challenge.email, code: next });
      setCode(next);
      passwordForm.reset();
      setStep("password");
    } catch (error) {
      setOtpError(
        error instanceof ApiError
          ? (error.fieldErrors?.code?.[0] ?? error.message)
          : "Something went wrong. Try again.",
      );
      setCode("");
      otpRef.current?.focus();
    } finally {
      setVerifying(false);
    }
  }

  const onSetPassword = passwordForm.handleSubmit(async ({ password }) => {
    if (!challenge) return;
    setSubmitting(true);
    try {
      await authApi.resetPassword({ email: challenge.email, code, password });
      toast.success("Password updated. Please log in with your new password.");
      router.push("/login");
    } catch (error) {
      // Most likely the code expired between "verify" and here — send them
      // back to re-enter (or resend) a fresh one.
      toast.error(
        error instanceof ApiError
          ? (error.fieldErrors?.code?.[0] ?? error.message)
          : "Something went wrong. Try again.",
      );
      setCode("");
      setStep("otp");
      setOtpError("Enter the latest code to continue.");
    } finally {
      setSubmitting(false);
    }
  });

  async function onResend() {
    if (!challenge || resend.secondsLeft > 0 || resending) return;
    setResending(true);
    try {
      const res = await authApi.resendPasswordResetOtp({ email: challenge.email });
      applyChallenge(res, challenge.email);
      setStep("otp");
      toast.success("New code sent.");
      otpRef.current?.focus();
    } catch (error) {
      if (error instanceof ApiError && error.code === "UNPROCESSABLE_ENTITY") {
        setOtpError(error.message);
      } else {
        toast.error(
          error instanceof ApiError ? error.message : "Something went wrong. Please try again.",
        );
      }
    } finally {
      setResending(false);
    }
  }

  // ── Step 3 — dedicated "set a new password" screen ──────────────────────
  if (step === "password" && challenge) {
    return (
      <form onSubmit={onSetPassword} noValidate className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => {
            setStep("otp");
            setOtpError(null);
          }}
          className="self-start font-body text-sm text-primary hover:underline"
        >
          ← Back
        </button>

        <p className="font-body text-sm text-text-secondary">
          Code verified for <strong className="text-text-primary">{challenge.email}</strong>. Choose a
          new password.
        </p>

        <AuthField
          label="New password"
          icon={Lock}
          revealable
          placeholder="Create a new password"
          autoComplete="new-password"
          error={passwordForm.formState.errors.password?.message}
          {...passwordForm.register("password")}
        />
        <AuthField
          label="Confirm new password"
          icon={Lock}
          revealable
          placeholder="Re-enter your new password"
          autoComplete="new-password"
          error={passwordForm.formState.errors.confirmPassword?.message}
          {...passwordForm.register("confirmPassword")}
        />

        <Button type="submit" isLoading={submitting}>
          {submitting ? "Updating…" : "Change password"}
        </Button>
      </form>
    );
  }

  // ── Step 2 — enter the code ────────────────────────────────────────────
  if (step === "otp" && challenge) {
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => {
            setStep("email");
            setChallenge(null);
            setCode("");
            setOtpError(null);
          }}
          className="self-start font-body text-sm text-primary hover:underline"
        >
          ← Change email
        </button>

        <p className="font-body text-sm text-text-secondary">
          Enter the {OTP_CODE_LENGTH}-digit code sent to{" "}
          <strong className="text-text-primary">{challenge.email}</strong>.
          {expiry.secondsLeft > 0
            ? ` Expires in ${mmss(expiry.secondsLeft)}.`
            : " This code has expired — resend a new one."}
        </p>

        <OtpInput
          ref={otpRef}
          value={code}
          onChange={(v) => {
            setCode(v);
            setOtpError(null);
          }}
          onComplete={(v) => void submitVerify(v)}
          length={OTP_CODE_LENGTH}
          invalid={Boolean(otpError)}
          disabled={verifying}
          autoFocus
          aria-describedby={otpError ? "otp-error" : undefined}
        />
        {otpError ? (
          <p id="otp-error" role="alert" className="font-body text-sm text-error">
            {otpError}
          </p>
        ) : null}

        <Button
          type="button"
          onClick={() => void submitVerify()}
          isLoading={verifying}
          disabled={code.length !== OTP_CODE_LENGTH}
        >
          {verifying ? "Verifying…" : "Verify code"}
        </Button>

        <button
          type="button"
          onClick={() => void onResend()}
          disabled={resend.secondsLeft > 0 || resending}
          className="self-center font-body text-sm text-primary hover:underline disabled:text-text-secondary disabled:no-underline"
        >
          {resend.secondsLeft > 0
            ? `Resend code in ${resend.secondsLeft}s`
            : resending
              ? "Sending…"
              : "Resend code"}
        </button>
      </div>
    );
  }

  // ── Step 1 — ask for the account email ─────────────────────────────────
  return (
    <form onSubmit={onRequest} noValidate className="flex flex-col gap-4">
      <p className="font-body text-sm text-text-secondary">
        Enter your account email and we&apos;ll send you a code to reset your password.
      </p>
      <AuthField
        label="Email Address"
        icon={Mail}
        type="email"
        placeholder="Enter your email"
        autoComplete="email"
        error={emailForm.formState.errors.email?.message}
        {...emailForm.register("email")}
      />

      <Button type="submit" isLoading={emailForm.formState.isSubmitting}>
        {emailForm.formState.isSubmitting ? "Sending code…" : "Send reset code"}
      </Button>
    </form>
  );
}
