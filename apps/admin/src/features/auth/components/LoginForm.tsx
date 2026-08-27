"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@woobe/validation";
import { Button, FormField } from "@woobe/ui";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
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
      await login(input);
      router.replace("/orders");
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
