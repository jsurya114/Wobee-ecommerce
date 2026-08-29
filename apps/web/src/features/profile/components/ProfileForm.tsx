"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { updateProfileSchema, type UpdateProfileInput } from "@woobe/validation";
import { Button, Card, FormField } from "@woobe/ui";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { ApiError } from "@/lib/api-client";
import * as profileApi from "../api/profile.client";

/**
 * Week 2 Day 3 (week2 (1).md §6 — "Edit permitted fields"). Only `name` is
 * editable here — email/phone are shown read-only, with a short note
 * explaining why, rather than silently omitted (a shopper who wonders "why
 * can't I change my email" deserves an answer, not a missing field). See
 * `updateProfileSchema`'s own doc comment for the full reasoning.
 */
export function ProfileForm() {
  const { user, accessToken, refreshUser } = useAuth();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { name: user?.name ?? "" },
  });

  if (!user || !accessToken) {
    return null;
  }

  const onSubmit = handleSubmit(async (data) => {
    try {
      await profileApi.updateProfile(data, accessToken);
      await refreshUser();
      toast.success("Profile updated");
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors?.name?.[0]) {
        setError("name", { message: error.fieldErrors.name[0] });
        return;
      }
      toast.error(error instanceof ApiError ? error.message : "Something went wrong. Please try again.");
    }
  });

  return (
    <Card className="flex flex-col gap-4 p-5">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormField label="Full name" autoComplete="name" error={errors.name?.message} {...register("name")} />
        <div>
          <p className="font-body text-xs text-text-secondary">Email</p>
          <p className="font-body text-sm text-text-primary">{user.email}</p>
        </div>
        {user.phone ? (
          <div>
            <p className="font-body text-xs text-text-secondary">Phone</p>
            <p className="font-body text-sm text-text-primary">{user.phone}</p>
          </div>
        ) : null}
        <p className="font-body text-xs text-text-secondary">
          Email and phone can&apos;t be changed here yet — contact support if either needs to be updated.
        </p>
        <Button type="submit" isLoading={isSubmitting} disabled={!isDirty}>
          Save changes
        </Button>
      </form>
    </Card>
  );
}
