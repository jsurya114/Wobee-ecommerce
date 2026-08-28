"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@woobe/validation";
import { Button, FormField } from "@woobe/ui";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { navEntriesForRole } from "@/features/shell/nav-config";
import { useAdminAuth } from "../hooks/useAdminAuth";

export function LoginForm() {
  const router = useRouter();
  const { login } = useAdminAuth();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (input) => {
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
      toast.error(error instanceof ApiError ? error.message : "Login failed");
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4">
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
      <Button type="submit" isLoading={isSubmitting}>
        Log in
      </Button>
    </form>
  );
}
