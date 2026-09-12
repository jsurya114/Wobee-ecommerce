"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { activateStaffFormSchema, type ActivateStaffFormValues } from "@woobe/validation";
import { Button, FormField } from "@woobe/ui";
import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { applyBackendFieldErrors } from "@/lib/apply-backend-field-errors";
import * as staffActivationApi from "../api/staff-activation.client";

/** Public, pre-auth — an invited staff member has no session yet (see /activate/page.tsx). Combines the API's two steps (verify, then set the password) into one submit for a simpler form; a wrong/expired code surfaces from the verify call before anything is set. */
export function ActivateStaffForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ActivateStaffFormValues>({
    resolver: zodResolver(activateStaffFormSchema),
    defaultValues: { email: searchParams.get("email") ?? "" },
  });

  const onSubmit = handleSubmit(async ({ email, code, password }) => {
    setFormError(null);
    try {
      await staffActivationApi.verifyStaffInvitation({ email, code });
      await staffActivationApi.activateStaff({ email, code, password });
      toast.success("Account activated — log in with your new password.");
      router.push("/login");
    } catch (error) {
      // A wrong/expired code is a domain error (no Zod field to attach to) — falls
      // through to the one inline banner below rather than a toast.
      if (!applyBackendFieldErrors<ActivateStaffFormValues>(error, setError)) {
        setFormError(error instanceof ApiError ? error.message : "Couldn't activate your account.");
      }
    }
  });

  // noValidate: react-hook-form + zodResolver already validates and shows a message per
  // field — the email input's own native format check still runs first otherwise.
  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4" noValidate>
      <FormField label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register("email")} />
      <FormField label="Activation code" inputMode="numeric" autoComplete="one-time-code" error={errors.code?.message} {...register("code")} />
      <FormField label="New password" type="password" autoComplete="new-password" error={errors.password?.message} {...register("password")} />
      <FormField
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register("confirmPassword")}
      />
      {formError ? (
        <p role="alert" className="font-body text-sm text-error">
          {formError}
        </p>
      ) : null}
      <Button type="submit" isLoading={isSubmitting}>
        Activate account
      </Button>
    </form>
  );
}
