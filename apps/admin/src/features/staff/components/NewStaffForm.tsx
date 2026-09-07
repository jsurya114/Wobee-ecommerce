"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { createStaffSchema, type CreateStaffInput } from "@woobe/validation";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Card, FormField, Label } from "@woobe/ui";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import * as staffApi from "../api/admin-staff.client";
import { STAFF_ROLE_LABELS } from "../lib/staff-labels";

export function NewStaffForm() {
  const router = useRouter();
  const { withFreshToken } = useAdminAuth();
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateStaffInput>({ resolver: zodResolver(createStaffSchema) });

  const onSubmit = handleSubmit(async (input) => {
    try {
      const result = await withFreshToken((token) => staffApi.createStaff(input, token));
      await queryClient.invalidateQueries({ queryKey: ["admin", "staff", "list"] });
      toast.success(`Invitation sent to ${result.staff.email}`);
      router.push(`/staff/${result.staff.id}`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't create this staff member.");
    }
  });

  return (
    <Card className="max-w-xl p-4">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormField label="Name" error={errors.name?.message} {...register("name")} />
        <FormField label="Email" type="email" error={errors.email?.message} {...register("email")} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="role">Role</Label>
          <select
            id="role"
            className="rounded-md border border-border bg-surface px-3 py-2 font-body text-sm text-text-primary"
            defaultValue=""
            {...register("role")}
          >
            <option value="" disabled>
              Select a role
            </option>
            {Object.entries(STAFF_ROLE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          {errors.role ? (
            <p role="alert" className="font-body text-sm text-error">
              {errors.role.message}
            </p>
          ) : null}
        </div>
        <p className="font-body text-xs text-text-secondary">
          They'll be emailed a code to activate their account and set their own password — you don't set one for them.
        </p>
        <Button type="submit" isLoading={isSubmitting}>
          Create staff
        </Button>
      </form>
    </Card>
  );
}
