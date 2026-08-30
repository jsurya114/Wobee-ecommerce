"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  OTP_CODE_LENGTH,
  registerStartSchema,
  type RegisterStartInput,
} from "@woobe/validation";
import { Button } from "@woobe/ui";
import { Lock, Mail, Phone, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import * as authApi from "../api/auth.client";
import { useAuth } from "../hooks/useAuth";
import { useCountdown } from "../hooks/useCountdown";
import { AuthField } from "./AuthField";
import { OtpInput, type OtpInputHandle } from "./OtpInput";
import { SocialAuthButtons } from "./SocialAuthButtons";

interface Challenge {
  email: string;
  expiresAt: number;
  resendAvailableAt: number;
}

function mmss(totalSeconds: number): string {
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

/**
 * Two-step, email-OTP-gated registration. Step 1 collects the details and
 * calls `/register/start` (no account yet); step 2 verifies the code
 * (emailed via nodemailer when SMTP is configured), which is what actually
 * creates the account. `register/page.tsx` and `AuthShell` are unchanged —
 * the step switch is internal here.
 */
export function RegisterForm() {
  const router = useRouter();
  const { verifyRegistrationOtp } = useAuth();

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const otpRef = useRef<OtpInputHandle>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterStartInput>({
    resolver: zodResolver(registerStartSchema),
  });

  const resend = useCountdown(challenge?.resendAvailableAt ?? null);
  const expiry = useCountdown(challenge?.expiresAt ?? null);

  const onStart = handleSubmit(async (data) => {
    try {
      const res = await authApi.startRegistration(data);
      setChallenge({
        email: data.email,
        expiresAt: Date.parse(res.expiresAt),
        resendAvailableAt: Date.parse(res.resendAvailableAt),
      });
      setCode("");
      setOtpError(null);
      toast.success("We've emailed you a verification code.");
      if (res.devCode) toast.info(`Dev code: ${res.devCode}`);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === "CONFLICT") {
          setError("email", { message: error.message });
          return;
        }
        if (error.fieldErrors) {
          for (const [field, messages] of Object.entries(error.fieldErrors)) {
            if (messages?.[0])
              setError(field as keyof RegisterStartInput, {
                message: messages[0],
              });
          }
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
      await verifyRegistrationOtp({ email: challenge.email, code: next });
      toast.success("Welcome to Woobe!");
      router.push("/account");
    } catch (error) {
      if (error instanceof ApiError && error.code === "CONFLICT") {
        // Email was taken between start and verify — send the user back.
        setChallenge(null);
        setError("email", { message: error.message });
        toast.error(error.message);
        return;
      }
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

  async function onResend() {
    if (!challenge || resend.secondsLeft > 0 || resending) return;
    setResending(true);
    try {
      const res = await authApi.resendRegistrationOtp({
        email: challenge.email,
      });
      const next = {
        email: challenge.email,
        expiresAt: Date.parse(res.expiresAt),
        resendAvailableAt: Date.parse(res.resendAvailableAt),
      };
      setChallenge(next);
      resend.reset(next.resendAvailableAt);
      expiry.reset(next.expiresAt);
      setCode("");
      setOtpError(null);
      toast.success("New code sent.");
      if (res.devCode) toast.info(`Dev code: ${res.devCode}`);
      otpRef.current?.focus();
    } catch (error) {
      if (error instanceof ApiError && error.code === "UNPROCESSABLE_ENTITY") {
        setOtpError(error.message);
      } else {
        toast.error(
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Please try again.",
        );
      }
    } finally {
      setResending(false);
    }
  }

  if (challenge) {
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => {
            setChallenge(null);
            setCode("");
            setOtpError(null);
          }}
          className="self-start font-body text-sm text-primary hover:underline"
        >
          ← Change details
        </button>

        <p className="font-body text-sm text-text-secondary">
          Enter the {OTP_CODE_LENGTH}-digit code emailed to{" "}
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
          <p
            id="otp-error"
            role="alert"
            className="font-body text-sm text-error"
          >
            {otpError}
          </p>
        ) : null}

        <Button
          type="button"
          onClick={() => void submitVerify()}
          isLoading={verifying}
          disabled={code.length !== OTP_CODE_LENGTH}
        >
          {verifying ? "Verifying…" : "Verify & create account"}
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

  return (
    <form onSubmit={onStart} noValidate className="flex flex-col gap-4">
      <AuthField
        label="Full name"
        icon={User}
        placeholder="Enter your name"
        autoComplete="name"
        error={errors.name?.message}
        {...register("name")}
      />
      <AuthField
        label="Email Address"
        icon={Mail}
        type="email"
        placeholder="Enter your email"
        autoComplete="email"
        error={errors.email?.message}
        {...register("email")}
      />
      <AuthField
        label="Phone (optional)"
        icon={Phone}
        type="tel"
        placeholder="Enter your phone number"
        autoComplete="tel"
        error={errors.phone?.message}
        {...register("phone")}
      />
      <AuthField
        label="Password"
        icon={Lock}
        revealable
        placeholder="Create a password"
        autoComplete="new-password"
        error={errors.password?.message}
        {...register("password")}
      />

      <Button type="submit" isLoading={isSubmitting}>
        {isSubmitting ? "Sending code…" : "Create account"}
      </Button>

      <SocialAuthButtons />
    </form>
  );
}
