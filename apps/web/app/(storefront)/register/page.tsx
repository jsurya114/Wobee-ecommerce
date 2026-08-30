import type { Metadata } from "next";
import { Heart } from "lucide-react";
import Link from "next/link";
import { AuthShell } from "@/features/auth/components/AuthShell";
import { RegisterForm } from "@/features/auth/components/RegisterForm";

/** Week 2 Day 9 — same reasoning as /login. */
export const metadata: Metadata = { title: "Register", robots: { index: false, follow: false } };

export default function RegisterPage() {
  return (
    <AuthShell image="/auth-hero-register.jpg">
      <div className="mb-6 text-center">
        <h1 className="flex items-center justify-center gap-2 font-display text-3xl text-text-primary">
          Create Account
          <Heart className="h-5 w-5 fill-primary text-primary" aria-hidden="true" />
        </h1>
        <p className="mt-1 font-body text-sm text-text-secondary">Join Woobe — fashion, by weight</p>
      </div>

      <RegisterForm />

      <p className="mt-6 text-center font-body text-sm text-text-secondary">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
