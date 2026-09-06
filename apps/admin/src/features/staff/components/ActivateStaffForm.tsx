"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { activateStaffFormSchema, type ActivateStaffFormValues } from "@woobe/validation";
import { Button, FormField } from "@woobe/ui";
import { useSearchParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import * as staffActivationApi from "../api/staff-activation.client";

/** Public, pre-auth — an invited staff member has no session yet (see /activate/page.tsx). Combines the API's two steps (verify, then set the password) into one submit for a simpler form; a wrong/expired code surfaces from the verify call before anything is set. */
export function ActivateStaffForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ActivateStaffFormValues>({
    resolver: zodResolver(activateStaffFormSchema),
    defaultValues: { email: searchParams.get("email") ?? "" },
  });

  const onSubmit = handleSubmit(async ({ email, code, password }) => {
    try {
      await staffActivationApi.verifyStaffInvitation({ email, code });
      await staffActivationApi.activateStaff({ email, code, password });
      toast.success("Account activated — log in with your new password.");
      router.push("/login");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't activate your account.");
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4">
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
      <Button type="submit" isLoading={isSubmitting}>
        Activate account
      </Button>
    </form>
  );
}
