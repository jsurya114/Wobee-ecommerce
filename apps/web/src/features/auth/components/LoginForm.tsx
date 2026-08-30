"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@woobe/validation";
import { Button } from "@woobe/ui";
import { Lock, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "../hooks/useAuth";
import { AuthField } from "./AuthField";
import { SocialAuthButtons } from "./SocialAuthButtons";

export function LoginForm() {
  const router = useRouter();
  const { login } = useAuth();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (data) => {
    try {
      await login(data);
      toast.success("Welcome back!");
      router.push("/");
    } catch (error) {
      if (error instanceof ApiError) {
        // Deliberately field-agnostic — the API already collapses "no such
        // user" and "wrong password" into one message (account-enumeration
        // protection); attaching it to a specific field would undo that.
        setError("root", { message: error.message });
        return;
      }
      toast.error("Something went wrong. Please try again.");
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
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
        label="Password"
        icon={Lock}
        revealable
        placeholder="Enter your password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register("password")}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 font-body text-sm text-text-secondary">
          <input type="checkbox" className="h-4 w-4 rounded border-border accent-primary" />
          Remember me
        </label>
        <Link href="/forgot-password" className="font-body text-sm font-medium text-primary hover:underline">
          Forgot password?
        </Link>
      </div>

      {errors.root?.message ? (
        <p role="alert" className="font-body text-sm text-error">
          {errors.root.message}
        </p>
      ) : null}

      <Button type="submit" isLoading={isSubmitting}>
        {isSubmitting ? "Logging in…" : "Login"}
      </Button>

      <SocialAuthButtons />
    </form>
  );
}
