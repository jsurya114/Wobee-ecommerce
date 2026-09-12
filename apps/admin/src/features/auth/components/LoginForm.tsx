"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@woobe/validation";
import { Button, FormField } from "@woobe/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ApiError } from "@/lib/api-client";
import { applyBackendFieldErrors } from "@/lib/apply-backend-field-errors";
import { navEntriesForRole } from "@/features/shell/nav-config";
import { useAdminAuth } from "../hooks/useAdminAuth";

export function LoginForm() {
  const router = useRouter();
  const { login } = useAdminAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (input) => {
    setFormError(null);
    try {
      const user = await login(input);
      // Not every staff role has MANAGE_ORDERS — a blind `/orders` redirect
      // landed product_management_staff on a page they get a 403 from,
      // with no other live page to go to instead (caught live, checking
      // the admin side: login succeeded, then "Couldn't load orders." was
      // the entire experience). Send them to the first LIVE section their
      // role actually has permission for; `/orders` stays the fallback for
      // a role with no live section at all (still true today for
      // product_management_staff — Products/Inventory are "coming soon"
      // until Day 7 — but at least a role that legitimately can use
      // Orders, like super_admin, never depends on this fallback).
      const firstLiveEntry = navEntriesForRole(user.role).find((entry) => entry.status === "live");
      router.replace(firstLiveEntry?.href ?? "/orders");
    } catch (error) {
      // A wrong email/password (401) has no Zod field to attach to — falls through to
      // the one inline banner below rather than a toast; a real 400 field error (rare
      // here, login only really has "wrong credentials") would land per-field instead.
      if (!applyBackendFieldErrors<LoginInput>(error, setError)) {
        setFormError(error instanceof ApiError ? error.message : "Login failed");
      }
    }
  });

  // noValidate: react-hook-form + zodResolver already validates and shows a message per
  // field — the email input's own native format check still runs first otherwise.
  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4" noValidate>
      <FormField
        label="Email"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register("email")}
      />
      <FormField
        label="Password"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register("password")}
      />
      {formError ? (
        <p role="alert" className="font-body text-sm text-error">
          {formError}
        </p>
      ) : null}
      <Button type="submit" isLoading={isSubmitting}>
        Log in
      </Button>
    </form>
  );
}
