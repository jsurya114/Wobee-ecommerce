"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, type RegisterInput } from "@woobe/validation";
import { Button } from "@woobe/ui";
import { Lock, Mail, Phone, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "../hooks/useAuth";
import { AuthField } from "./AuthField";
import { SocialAuthButtons } from "./SocialAuthButtons";

export function RegisterForm() {
  const router = useRouter();
  const { register: registerUser } = useAuth();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  const onSubmit = handleSubmit(async (data) => {
    try {
      await registerUser(data);
      toast.success("Welcome to Woobe!");
      router.push("/account");
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === "CONFLICT") {
          setError("email", { message: error.message });
          return;
        }
        if (error.fieldErrors) {
          for (const [field, messages] of Object.entries(error.fieldErrors)) {
            if (messages?.[0]) setError(field as keyof RegisterInput, { message: messages[0] });
          }
          return;
        }
        toast.error(error.message);
        return;
      }
      toast.error("Something went wrong. Please try again.");
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
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
        {isSubmitting ? "Creating account…" : "Create account"}
      </Button>

      <SocialAuthButtons />
    </form>
  );
}
